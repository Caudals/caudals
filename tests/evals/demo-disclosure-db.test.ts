import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAskApi, fakeModelFetch, fakeReadSite } from "../../scripts/demo/fake-demo";
import { OPENING_MESSAGE, PERSON_QUESTION } from "@/lib/evals/scoring/disclosure";
import { testDatabaseUrls } from "../helpers/test-database";

// The AI-disclosure check in the demo engine (launch L-29), on the production
// schema with fake pages, a fake assistant and a fake model. Events and email
// are observed, never sent.
vi.mock("@/lib/demo/events", () => ({ demoStarted: () => {}, demoFinished: () => {} }));
vi.mock("@/lib/resend/client", () => ({ getResendClient: () => ({ emails: { send: async () => ({ data: { id: "fake" }, error: null }) } }) }));

const { ownerUrl, runtimeUrl } = testDatabaseUrls("demo_disclosure");
const PRIMARY = "http://primary.demo.test/v1";
const FALLBACK = "https://fallback.demo.test/api/v1";

describe.skipIf(!ownerUrl || !runtimeUrl)("demo AI-disclosure check on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  let store: typeof import("@/lib/demo/store");
  let runner: typeof import("@/lib/demo/runner");
  let view: typeof import("@/lib/demo/view");
  let health: typeof import("@/lib/demo/health");
  const asked: Array<{ host: string; question: string }> = [];
  let personAnswer = "No, I'm an AI assistant for Acme.";

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: runtimeUrl,
      DEMO_SECRET: "test-secret",
      DEMO_ENABLED: "true",
      DEMO_ENDPOINT: PRIMARY,
      DEMO_MODELS: "primary-model",
    });
    [store, runner, view, health] = await Promise.all([import("@/lib/demo/store"), import("@/lib/demo/runner"), import("@/lib/demo/view"), import("@/lib/demo/health")]);
    runner.demoIo.readSite = fakeReadSite(5) as never;
    const answer = fakeAskApi(2);
    runner.demoIo.askApi = (async (spec: { url: string }, secrets: unknown, question: string) => {
      asked.push({ host: new URL(spec.url).hostname, question });
      if (question === OPENING_MESSAGE.en) return { text: "Welcome! I can help with plans, refunds and security.", ms: 2, error: null };
      if (question === PERSON_QUESTION.en) return { text: personAnswer, ms: 2, error: null };
      return answer(spec, secrets, question);
    }) as never;
  });

  beforeEach(async () => {
    await owner.query("DELETE FROM demo.run; DELETE FROM demo.llm_usage");
    asked.length = 0;
    personAnswer = "No, I'm an AI assistant for Acme.";
    health.resetHealth();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await owner.query("DELETE FROM demo.run; DELETE FROM demo.llm_usage");
    await owner.end();
    const { getPostgresPool } = await import("@/lib/db/client");
    await getPostgresPool().end();
  });

  let counter = 0;
  async function insert(disclosure: boolean) {
    const host = `site${++counter}.example.test`;
    const spec = { kind: "openai_compatible", url: `https://api.${host}/v1/chat/completions`, model: "m" } as const;
    const id = await store.insertRun({
      tokenHash: randomBytes(32).toString("hex"), locale: "en", spec, targetHost: new URL(spec.url).hostname,
      docsUrl: `https://${host}/help`, docsHost: host, clientHash: randomBytes(32).toString("hex"), auth: false, queued: false, disclosure,
    });
    return { id, host: `api.${host}` };
  }
  const raw = async (id: string) => (await owner.query("SELECT * FROM demo.run WHERE id = $1", [id])).rows[0];
  async function finish(ids: string[], timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await runner.tick();
      const rows = await Promise.all(ids.map(raw));
      if (rows.every((row) => row.phase === "done" || row.phase === "failed")) return rows;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("timed out");
  }

  it("records the check beside the answers, never in the verdicts or the score", async () => {
    vi.stubGlobal("fetch", fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK }).fetch);
    const checked = await insert(true);
    const plain = await insert(false);
    const [withCheck, without] = await finish([checked.id, plain.id]);
    expect(withCheck.phase).toBe("done");
    expect(without.phase).toBe("done");

    // Stored in demo.run.answers under its own key, with the transcript as evidence.
    const stored = withCheck.answers.ai_disclosure;
    expect(stored).toMatchObject({ requested: true, language: "en", result: { status: "disclosed", reason: "self_identified", method: "pattern", scored: false } });
    expect(stored.result.evidence).toEqual({ turn: "person_answer", quote: "No, I'm an AI assistant for Acme." });
    expect(stored.result.transcript.map((turn: { kind: string }) => turn.kind)).toEqual(["opening", "first_reply", "person_question", "person_answer"]);
    expect(without.answers.ai_disclosure).toBeUndefined();

    // The 8-question score is unchanged: same verdict counts, no extra case, nothing in verdicts or summary.
    expect(withCheck.summary).toEqual(without.summary);
    expect(Object.keys(withCheck.verdicts)).not.toContain("ai_disclosure");
    expect(JSON.stringify(withCheck.summary)).not.toContain("disclos");
    expect(withCheck.summary.total).toBe(withCheck.cases.length);

    // Two extra calls to the system (the opening and the question), no extra model call.
    const calls = (host: string) => asked.filter((call) => call.host === host).length;
    expect(calls(checked.host)).toBe(calls(plain.host) + 2);
    expect(withCheck.llm_calls).toBe(without.llm_calls);

    // The engine and the page see case answers only; the result shows only while the flag is on.
    const run = (await store.getRun(checked.id))!;
    expect(Object.keys(run.answers).sort()).toEqual(run.cases.map((item) => item.id).sort());
    expect(run.disclosure?.result?.status).toBe("disclosed");
    const extras = { position: null, slots: 3, durations: { p50: 240, p90: 480 }, service: "ok" as const, notifyAvailable: false };
    expect(view.viewOf(run, { ...extras, disclosure: true }).disclosure).toMatchObject({ status: "disclosed" });
    expect(view.viewOf(run, { ...extras, disclosure: false }).disclosure).toBeNull();
    expect(view.viewOf((await store.getRun(plain.id))!, { ...extras, disclosure: true }).disclosure).toBeNull();
    vi.unstubAllGlobals();
  }, 120_000);

  it("asks the judge only when the patterns cannot decide, and keeps its answer", async () => {
    personAnswer = "I can help with plans, refunds and security questions.";
    const provider = fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK });
    const judged: string[] = [];
    vi.stubGlobal("fetch", (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
      const system = body.messages?.find((message) => message.role === "system")?.content ?? "";
      if (system.includes("did the assistant make clear")) {
        judged.push(body.messages?.find((message) => message.role === "user")?.content ?? "");
        return Response.json({ model: "primary-model", choices: [{ message: { role: "assistant", content: '{"status":"not_disclosed","turn":null,"quote":null}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
      }
      return provider.fetch(input, init);
    }) as typeof fetch);
    const checked = await insert(true);
    const [row] = await finish([checked.id]);
    expect(row.phase).toBe("done");
    expect(judged).toHaveLength(1);
    expect(judged[0]).toContain("[person_answer]");
    expect(row.answers.ai_disclosure.result).toMatchObject({ status: "not_disclosed", reason: "judge", method: "judge", evidence: null });
    // Writing, grading and the one disclosure judgement.
    expect(row.llm_calls).toBe(3);
    vi.unstubAllGlobals();
  }, 120_000);

  it("stays Unclear and still finishes the report when the judge cannot answer", async () => {
    personAnswer = "I can help with plans, refunds and security questions.";
    const provider = fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK });
    vi.stubGlobal("fetch", (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
      if (body.messages?.some((message) => message.content.includes("did the assistant make clear"))) return Response.json({ error: { message: "down" } }, { status: 503 });
      return provider.fetch(input, init);
    }) as typeof fetch);
    const checked = await insert(true);
    const [row] = await finish([checked.id]);
    expect(row.phase).toBe("done");
    expect(row.error_code).toBeNull();
    expect(row.summary.scored).toBeGreaterThan(0);
    expect(row.answers.ai_disclosure.result).toMatchObject({ status: "unclear", reason: "no_signal" });
    vi.unstubAllGlobals();
  }, 120_000);

  it("never changes a finished run, and a run without a capture reads Unclear (not captured)", async () => {
    vi.stubGlobal("fetch", fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK }).fetch);
    const checked = await insert(true);
    // A capture that never arrived (a website whose browser work failed): drop it as the engine asks.
    const spy = vi.spyOn(store, "setDisclosureCapture").mockResolvedValue();
    const [row] = await finish([checked.id]);
    spy.mockRestore();
    expect(row.answers.ai_disclosure.result).toMatchObject({ status: "unclear", reason: "not_captured", transcript: [] });
    await store.setDisclosureCapture(checked.id, { requested: true, transcript: [] });
    expect((await raw(checked.id)).answers.ai_disclosure.result.status).toBe("unclear");
    vi.unstubAllGlobals();
  }, 120_000);
});
