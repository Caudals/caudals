import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPostgresPool: () => db }));
vi.mock("@/lib/evals/repositories/platform", async (original) => {
  const actual = await original<typeof import("@/lib/evals/repositories/platform")>();
  return { ...actual, asAdmin: async (_scope: unknown, work: (client: unknown) => Promise<unknown>) => work(db) };
});

import { demoModels, demoProviderKey, fallbackDemoModels } from "@/lib/demo/model-settings";
import { chat } from "@/lib/demo/llm";
import { getDemoSettings, listDemoModels, setDemoModel } from "@/lib/evals/repositories/demo-settings";

const admin: EvalIdentity = { user: { id: "admin", email: "admin@example.test", name: "Admin" }, platformRole: "platform_admin", workspaces: [] };
const customer: EvalIdentity = { ...admin, platformRole: null };
const orgId = "00000000-0000-4000-8000-000000000001";
const free = (id: string) => ({ id, name: id, pricing: { prompt: "0", completion: "0", request: "0" }, architecture: { output_modalities: ["text"] } });

beforeEach(() => {
  vi.stubEnv("DEMO_ENDPOINT", "http://192.168.70.19:11434/v1");
  vi.stubEnv("DEMO_MODELS", "default-model,backup-model");
  db.query.mockReset().mockResolvedValue({ rows: [] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("demo model administration", () => {
  it("rejects non-admin reads, listings and writes before database or network access", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(getDemoSettings(customer, orgId)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(listDemoModels(customer)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(setDemoModel(customer, orgId, { modelId: "selected" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    expect(db.query).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("lists local text models without returning the endpoint or a key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ id: "deepseek" }, { id: "nomic-embed-text" }] })));
    expect(await listDemoModels(admin)).toEqual([{ id: "deepseek", label: "deepseek" }]);
    expect(await getDemoSettings(admin, orgId)).toEqual({ modelId: "default-model", provider: "DGX Spark / OpenAI-compatible API" });
  });

  it("excludes paid, malformed-price and non-text OpenRouter models; validates writes server-side", async () => {
    vi.stubEnv("DEMO_ENDPOINT", "https://openrouter.ai/api/v1");
    const fetch = vi.fn().mockImplementation(async () => Response.json({ data: [free("free-model"), { ...free("paid"), pricing: { prompt: "0.01", completion: "0" } }, { ...free("bad-price"), pricing: { prompt: "", completion: "0" } }, { ...free("image"), architecture: { output_modalities: ["image"] } }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await listDemoModels(admin)).toEqual([{ id: "free-model", label: "free-model" }]);
    await expect(setDemoModel(admin, orgId, { modelId: "paid" })).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("reports a failed catalog without saving a preference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(setDemoModel(admin, orgId, { modelId: "selected" })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("saves and audits a model, and the next actual completion uses it while retaining quota and fallbacks", async () => {
    let saved: string | undefined;
    db.query.mockImplementation(async (sql: string, values: string[] = []) => {
      if (sql.startsWith("INSERT INTO demo.model_setting")) saved = values[1];
      if (sql.startsWith("SELECT model_id")) return { rows: saved ? [{ model_id: saved }] : [] };
      return { rows: [{ calls: 1 }] };
    });
    const fetch = vi.fn().mockImplementation(async (url: string) => url.endsWith("/models")
      ? Response.json({ data: [{ id: "selected" }] })
      : Response.json({ model: "selected", choices: [{ message: { content: "answer" } }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await setDemoModel(admin, orgId, { modelId: "selected" })).toEqual({ modelId: "selected" });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("'engine.demo.model'"), [orgId, "admin", "selected"]);
    expect(await getDemoSettings(admin, orgId)).toMatchObject({ modelId: "selected" });
    expect(await demoModels()).toEqual(["selected", "default-model", "backup-model"]);
    expect(await chat({ messages: [{ role: "user", content: "Question" }], maxTokens: 20 })).toEqual({ text: "answer", model: "selected" });
    const body = JSON.parse(fetch.mock.calls.at(-1)![1].body);
    expect(body.model).toBe("selected");
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO demo.llm_usage"), [200]);
  });

  it("uses defaults without a saved preference, removes duplicates, and binds preferences to the provider", async () => {
    expect(await demoModels()).toEqual(["default-model", "backup-model"]);
    const first = demoProviderKey();
    vi.stubEnv("DEMO_ENDPOINT", "https://openrouter.ai/api/v1");
    expect(demoProviderKey()).not.toBe(first);
    vi.stubEnv("DEMO_MODELS", "a, a, b");
    expect(fallbackDemoModels()).toEqual(["a", "b"]);
    db.query.mockResolvedValue({ rows: [{ model_id: "b" }] });
    expect(await demoModels()).toEqual(["b", "a"]);
  });
});
