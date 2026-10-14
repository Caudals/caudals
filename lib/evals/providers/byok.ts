import "server-only";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { publicAddress } from "./openai-compatible";
import { BYOK_ENDPOINTS, type ByokProvider } from "../byok/shared";

/**
 * The check a workspace key gets before it is saved (BYOK, launch L-27,
 * spec v2 §6.11). It runs in the web process with the key the owner just
 * typed (the only time the web process holds it in clear) and uses the
 * provider's free calls only: the model list (OpenAI, Anthropic, Google,
 * Mistral) or OpenRouter's key status. No tokens are generated, so the check
 * costs nothing. A rejected key is never saved.
 *
 * The key goes only to the provider's own fixed address (never one a person
 * typed), with redirects refused. Nothing the provider answers is echoed:
 * the outcome is a fixed state and a list of model ids.
 */

export type KeyCheck = { state: "valid" | "quota_exceeded"; models: string[] };
export type KeyCheckFailure = "rejected" | "unreachable" | "unexpected";
export class KeyCheckFailed extends Error {
  constructor(readonly reason: KeyCheckFailure, readonly status?: number) {
    super(`byok_key_${reason}`);
    this.name = "KeyCheckFailed";
  }
}

/** A key as typed: printable ASCII without spaces, as every provider issues them. */
export const providerKeySchema = z.string().trim().min(8).max(512).regex(/^[\x21-\x7e]+$/, "Paste the key exactly as your provider shows it.");

/** Model ids the engine can call: the shape evals.byok_set_route accepts, without embedding, audio or image models. */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;
const NOT_CHAT = /(embed|tts|whisper|dall-e|moderation|transcri|audio|realtime|image|imagen|veo|search-preview|aqa|ocr|rerank)/i;
export const MAX_MODELS = 500;

export function chatModels(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => MODEL_ID.test(id) && !NOT_CHAT.test(id)))].sort((a, b) => a.localeCompare(b)).slice(0, MAX_MODELS);
}

export interface CheckOptions {
  fetch?: typeof fetch;
  /** Whether a host resolves only to public addresses; the default asks DNS. */
  publicHost?: (hostname: string) => Promise<boolean>;
  timeoutMs?: number;
}

async function dnsPublic(hostname: string) {
  const addresses = await lookup(hostname, { all: true }).catch(() => []);
  return addresses.length > 0 && addresses.every((item) => publicAddress(item.address));
}

const listSchema = z.object({ data: z.array(z.object({ id: z.string().max(300) }).passthrough()).max(5000) }).passthrough();
const openRouterKeySchema = z.object({
  data: z.object({ limit: z.number().nullable().optional(), limit_remaining: z.number().nullable().optional() }).passthrough(),
}).passthrough();

/** Checks a provider key with the provider's free calls. Throws KeyCheckFailed; never returns or logs the key. */
export async function checkProviderKey(provider: ByokProvider, key: string, options: CheckOptions = {}): Promise<KeyCheck> {
  const doFetch = options.fetch ?? fetch;
  const publicHost = options.publicHost ?? dnsPublic;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const base = BYOK_ENDPOINTS[provider];
  async function get(url: string, headers: Record<string, string>): Promise<unknown> {
    const target = new URL(url);
    if (target.protocol !== "https:" || !(await publicHost(target.hostname))) throw new KeyCheckFailed("unreachable");
    let response: Response;
    try {
      response = await doFetch(target, { method: "GET", headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new KeyCheckFailed("unreachable");
    }
    // The body is read and parsed, never repeated: provider errors can quote parts of a key.
    const text = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) throw new KeyCheckFailed("rejected", response.status);
    if (response.status === 429 || response.status >= 500) throw new KeyCheckFailed("unreachable", response.status);
    if (!response.ok) throw new KeyCheckFailed(response.status === 400 || response.status === 404 ? "rejected" : "unexpected", response.status);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new KeyCheckFailed("unexpected", response.status);
    }
  }
  const bearer = { authorization: `Bearer ${key}`, accept: "application/json" };
  if (provider === "openrouter") {
    // OpenRouter lists models without a key; its key endpoint says whether the key is valid and has credit left.
    const status = openRouterKeySchema.safeParse(await get(`${base}/key`, bearer));
    if (!status.success) throw new KeyCheckFailed("unexpected");
    const remaining = status.data.data.limit_remaining;
    const listed = listSchema.safeParse(await get(`${base}/models`, { accept: "application/json" }));
    return { state: typeof remaining === "number" && remaining <= 0 ? "quota_exceeded" : "valid", models: listed.success ? chatModels(listed.data.data.map((item) => item.id)) : [] };
  }
  const headers = provider === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01", accept: "application/json" } : bearer;
  const listed = listSchema.safeParse(await get(provider === "anthropic" ? `${base}/models?limit=1000` : `${base}/models`, headers));
  if (!listed.success) throw new KeyCheckFailed("unexpected");
  // Listing models is free and works without credit, so quota is learnt on the first real call.
  return { state: "valid", models: chatModels(listed.data.data.map((item) => item.id)) };
}
