import "server-only";
import { getPostgresPool } from "@/lib/db/client";
import { createHash } from "node:crypto";
import { getSecretEnvValue } from "@/lib/env/secrets";

/** Tried in order when the preferred model is unavailable. */
export const DEFAULT_DGX_ENDPOINT = "http://192.168.70.19:11434/v1";
export const DEFAULT_DEMO_MODELS = ["bluehawana/deepseek-v4-flash:iq2_m"];

export function safeDemoSecret(name: string): string | undefined {
  try { return getSecretEnvValue(name); } catch { return undefined; }
}

export function demoEndpoint(): string {
  const configured = (safeDemoSecret("DEMO_ENDPOINT") ?? safeDemoSecret("DEMO_DGX_ENDPOINT") ?? safeDemoSecret("EVALS_DGX_ENDPOINT"))?.trim();
  const base = configured || DEFAULT_DGX_ENDPOINT;
  return base.endsWith("/chat/completions") ? base : `${base.replace(/\/+$/, "")}/chat/completions`;
}

/** Bind a preference to its provider without exposing private endpoints. */
export function demoProviderKey(): string {
  return createHash("sha256").update(demoEndpoint()).digest("hex");
}

export function fallbackDemoModels(): string[] {
  const configured = (process.env.DEMO_MODELS ?? process.env.DEMO_MODEL ?? "").split(",").map((model) => model.trim()).filter(Boolean);
  return [...new Set(configured.length ? configured : DEFAULT_DEMO_MODELS)];
}

/** Read on every completion: a saved choice applies without restarting the app. */
export async function demoModels(): Promise<string[]> {
  const fallback = fallbackDemoModels();
  try {
    const { rows } = await getPostgresPool().query<{ model_id: string }>("SELECT model_id FROM demo.model_setting WHERE provider_key=$1", [demoProviderKey()]);
    return rows[0] ? [rows[0].model_id, ...fallback.filter((model) => model !== rows[0].model_id)] : fallback;
  } catch {
    return fallback;
  }
}

