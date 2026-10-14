/**
 * Bring your own provider key (launch L-27, spec v2 §6.11): the key check
 * before saving, failure reasons, flags, report data routing and copy. No
 * database; the isolation, routing and billing suites are in byok-db.test.ts.
 */
import { describe, expect, it } from "vitest";
import { checkProviderKey, chatModels, KeyCheckFailed } from "../../lib/evals/providers/byok";
import { providerErrorDetail } from "../../lib/evals/providers/openai-compatible";
import { customerKeyReason, ProviderFailure } from "../../lib/evals/providers/contracts";
import { BYOK_ENDPOINTS, BYOK_PROVIDERS, CUSTOMER_KEY_REASONS, isCustomerKeyReason, RESUMABLE_KEY_REASONS } from "../../lib/evals/byok/shared";
import { byokConfigured, byokEnabledFor, byokWorkspaceIds } from "../../lib/evals/repositories/byok";
import { messages } from "../../lib/evals/messages/en";
import { es } from "../../lib/evals/messages/es";
import { reportSnapshotSchema } from "../../lib/evals/reports/contracts";

// Synthetic, key-shaped strings: never real credentials.
const KEYS: Record<string, string> = {
  openai: `sk-proj-${"Q7".repeat(20)}`,
  anthropic: `sk-ant-api03-${"Zx9".repeat(14)}`,
  google: `AIzaSy${"Gk3".repeat(11)}`,
  mistral: "m".repeat(8) + "Mistral7Key9Fixture0Abc1",
  openrouter: `sk-or-v1-${"0a".repeat(32)}`,
};
type Call = { url: string; headers: Record<string, string>; redirect?: string };
function fakeFetch(answer: (url: string) => { status: number; body: unknown } | Error) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), redirect: init?.redirect });
    const result = answer(url);
    if (result instanceof Error) throw result;
    return new Response(typeof result.body === "string" ? result.body : JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const publicHost = async () => true;

describe("key check before saving (free calls only)", () => {
  it("lists models with the key, only at the provider's own address, without following redirects", async () => {
    for (const provider of ["openai", "mistral", "google"] as const) {
      const { calls, fetchImpl } = fakeFetch(() => ({ status: 200, body: { data: [{ id: "chat-model-b" }, { id: "chat-model-a" }, { id: "text-embedding-3" }, { id: "whisper-1" }] } }));
      const result = await checkProviderKey(provider, KEYS[provider], { fetch: fetchImpl, publicHost });
      expect(result).toEqual({ state: "valid", models: ["chat-model-a", "chat-model-b"] });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${BYOK_ENDPOINTS[provider]}/models`);
      expect(calls[0].headers.authorization).toBe(`Bearer ${KEYS[provider]}`);
      expect(calls[0].redirect).toBe("error");
    }
  });

  it("uses Anthropic's own headers", async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ status: 200, body: { data: [{ id: "claude-opus-5-5" }], has_more: false } }));
    expect(await checkProviderKey("anthropic", KEYS.anthropic, { fetch: fetchImpl, publicHost })).toEqual({ state: "valid", models: ["claude-opus-5-5"] });
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/models?limit=1000");
    expect(calls[0].headers["x-api-key"]).toBe(KEYS.anthropic);
    expect(calls[0].headers["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0].headers.authorization).toBeUndefined();
  });

  it("reads OpenRouter's key status (quota) and lists models without sending the key", async () => {
    const answers = (remaining: number | null) => fakeFetch((url) => url.endsWith("/key")
      ? { status: 200, body: { data: { limit: remaining === null ? null : 0, limit_remaining: remaining, usage: 0 } } }
      : { status: 200, body: { data: [{ id: "openai/gpt-6-luna" }, { id: "google/gemini-3.8-flash" }] } });
    const spent = answers(0);
    expect(await checkProviderKey("openrouter", KEYS.openrouter, { fetch: spent.fetchImpl, publicHost })).toEqual({ state: "quota_exceeded", models: ["google/gemini-3.8-flash", "openai/gpt-6-luna"] });
    expect(spent.calls.map((call) => call.url)).toEqual(["https://openrouter.ai/api/v1/key", "https://openrouter.ai/api/v1/models"]);
    expect(spent.calls[0].headers.authorization).toBe(`Bearer ${KEYS.openrouter}`);
    expect(JSON.stringify(spent.calls[1].headers)).not.toContain(KEYS.openrouter);
    const unlimited = answers(null);
    expect((await checkProviderKey("openrouter", KEYS.openrouter, { fetch: unlimited.fetchImpl, publicHost })).state).toBe("valid");
  });

  it("refuses rejected keys and never repeats what the provider said", async () => {
    const echo = { error: { message: `Incorrect API key provided: ${KEYS.openai}` } };
    for (const status of [400, 401, 403]) {
      const { fetchImpl } = fakeFetch(() => ({ status, body: echo }));
      const error = await checkProviderKey("openai", KEYS.openai, { fetch: fetchImpl, publicHost }).catch((caught) => caught);
      expect(error).toBeInstanceOf(KeyCheckFailed);
      expect(error.reason).toBe("rejected");
      expect(`${error.message} ${JSON.stringify(error)}`).not.toContain(KEYS.openai);
    }
    for (const [status, reason] of [[429, "unreachable"], [500, "unreachable"], [418, "unexpected"]] as const) {
      const { fetchImpl } = fakeFetch(() => ({ status, body: echo }));
      expect((await checkProviderKey("openai", KEYS.openai, { fetch: fetchImpl, publicHost }).catch((caught) => caught)).reason).toBe(reason);
    }
    const down = fakeFetch(() => new Error("connect ECONNREFUSED"));
    expect((await checkProviderKey("mistral", KEYS.mistral, { fetch: down.fetchImpl, publicHost }).catch((caught) => caught)).reason).toBe("unreachable");
    const garbled = fakeFetch(() => ({ status: 200, body: "<html>" }));
    expect((await checkProviderKey("google", KEYS.google, { fetch: garbled.fetchImpl, publicHost }).catch((caught) => caught)).reason).toBe("unexpected");
  });

  it("never sends the key when the provider's address is not public", async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ status: 200, body: { data: [] } }));
    const error = await checkProviderKey("openai", KEYS.openai, { fetch: fetchImpl, publicHost: async () => false }).catch((caught) => caught);
    expect(error.reason).toBe("unreachable");
    expect(calls).toHaveLength(0);
  });

  it("keeps chat model ids the engine can route, at most 500", () => {
    expect(chatModels(["b", "a", "a", "dall-e-3", "tts-1", "omni-moderation", "bad id", "x".repeat(201), "models/gemini-3.8-flash"])).toEqual(["a", "b", "models/gemini-3.8-flash"]);
    expect(chatModels(Array.from({ length: 900 }, (_, index) => `model-${String(index).padStart(3, "0")}`))).toHaveLength(500);
  });
});

describe("failure reasons (INV-11: never a fallback)", () => {
  it("maps provider failures on a workspace key to customer_key_* reasons", () => {
    expect(customerKeyReason("invalid_credentials")).toBe("customer_key_invalid");
    expect(customerKeyReason("quota_exceeded")).toBe("customer_key_quota");
    expect(customerKeyReason("model_missing")).toBe("customer_key_model");
    expect(customerKeyReason("overloaded")).toBe("customer_key_rate_limited");
    expect(customerKeyReason("unsupported_feature")).toBe("customer_key_rejected");
    for (const code of ["network_unavailable", "service_unavailable", "malformed_output"] as const) expect(customerKeyReason(code)).toBe("customer_key_unavailable");
    expect(new ProviderFailure("quota_exceeded", "rejected").code).toBe("quota_exceeded");
    expect(CUSTOMER_KEY_REASONS.every(isCustomerKeyReason)).toBe(true);
    expect(isCustomerKeyReason("credits_exhausted")).toBe(false);
    expect(RESUMABLE_KEY_REASONS).not.toContain("customer_key_revoked");
  });

  it("masks every provider's key format in logged error details", () => {
    for (const key of Object.values(KEYS)) {
      for (const body of [JSON.stringify({ error: { message: `Invalid key ${key}` } }), JSON.stringify({ error: `bad key: ${key}` }), `plain ${key} text`]) {
        expect(providerErrorDetail(body) ?? "").not.toContain(key);
      }
    }
  });
});

describe("flags", () => {
  const org = "11111111-2222-4333-8444-555555555555";
  it("is off by default, on for listed workspaces, or for every eligible workspace", () => {
    expect(byokEnabledFor(org, {})).toBe(false);
    expect(byokConfigured({})).toBe(false);
    expect(byokEnabledFor(org, { BYOK_ENABLED: "1" })).toBe(false);
    expect(byokEnabledFor(org, { BYOK_WORKSPACE_IDS: ` ${org.toUpperCase()} ,not-a-uuid` })).toBe(true);
    expect(byokWorkspaceIds({ BYOK_WORKSPACE_IDS: `${org},x` }).size).toBe(1);
    expect(byokEnabledFor("99999999-2222-4333-8444-555555555555", { BYOK_WORKSPACE_IDS: org })).toBe(false);
    expect(byokEnabledFor(org, { BYOK_ENABLED: "true" })).toBe(true);
    expect(byokConfigured({ BYOK_WORKSPACE_IDS: org })).toBe(true);
  });
});

describe("report methodology", () => {
  it("accepts data routing as an optional, closed value", () => {
    const methodology = reportSnapshotSchema.shape.methodology;
    const base = { cef_version: "1.0", scorer_version: "v", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "", exclusions: [], review_coverage: "", cost: null, limitations: [] };
    expect(methodology.safeParse(base).success).toBe(true);
    expect(methodology.safeParse({ ...base, data_routing: "customer_provider" }).success).toBe(true);
    expect(methodology.safeParse({ ...base, data_routing: "elsewhere" }).success).toBe(false);
  });
});

describe("interface strings", () => {
  it("every BYOK string has Spanish with the same placeholders", () => {
    const keys = (Object.keys(messages) as Array<keyof typeof messages>).filter((key) => /^(byok|keyFailed|keyReason_|reportDataRouting|reportRouting_|estimateYourKey)/.test(key));
    expect(keys.length).toBeGreaterThan(60);
    for (const reason of CUSTOMER_KEY_REASONS) expect(keys).toContain(`keyReason_${reason}`);
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of keys) {
      expect(es[key], key).toBeTruthy();
      expect(placeholders(es[key]!), key).toEqual(placeholders(messages[key]));
    }
    expect(BYOK_PROVIDERS).toHaveLength(5);
  });
});
