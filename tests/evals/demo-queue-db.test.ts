import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAskApi, fakeModelFetch, fakeReadSite } from "../../scripts/demo/fake-demo";
import { testDatabaseUrls } from "../helpers/test-database";

// Events and email are observed, never sent.
const events = vi.hoisted(() => [] as Array<{ name: string; id: string; payload: Record<string, unknown> }>);
vi.mock("@/lib/demo/events", () => ({
  demoStarted: (run: { id: string }) => events.push({ name: "demo_started", id: run.id, payload: run as never }),
  demoFinished: (run: { id: string }) => events.push({ name: "demo_finished", id: run.id, payload: run as never }),
}));
const sent = vi.hoisted(() => [] as Array<{ to: string; subject: string; text: string; key?: string }>);
const emailFailure = vi.hoisted(() => ({ loseResponse: false }));
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: async (payload: { to: string; subject: string; text: string }, options?: { idempotencyKey?: string }) => {
    sent.push({ ...payload, key: options?.idempotencyKey });
    if (emailFailure.loseResponse) { emailFailure.loseResponse = false; throw new Error("response_lost"); }
    return { data: { id: "fake" }, error: null };
  } } }),
}));

const { ownerUrl, runtimeUrl } = testDatabaseUrls("demo_queue");

const PRIMARY = "http://primary.demo.test/v1";
const FALLBACK = "https://fallback.demo.test/api/v1";

describe.skipIf(!ownerUrl || !runtimeUrl)("demo queue, fallback cap and report email on the production schema", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  let store: typeof import("@/lib/demo/store");
  let queue: typeof import("@/lib/demo/queue");
  let fallback: typeof import("@/lib/demo/fallback");
  let runner: typeof import("@/lib/demo/runner");
  let notify: typeof import("@/lib/demo/notify");
  let health: typeof import("@/lib/demo/health");
  let status: typeof import("@/lib/demo/status");

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-keyring-"));
    writeFileSync(join(dir, "keyring.json"), JSON.stringify({ v1: randomBytes(32).toString("base64") }));
    Object.assign(process.env, {
      DATABASE_URL: runtimeUrl,
      DEMO_SECRET: "test-secret",
      DEMO_ENABLED: "true",
      DEMO_QUEUE_ENABLED: "true",
      DEMO_FALLBACK_ENABLED: "true",
      DEMO_ENDPOINT: PRIMARY,
      DEMO_MODELS: "primary-model",
      DEMO_FALLBACK_ENDPOINT: FALLBACK,
      DEMO_FALLBACK_API_KEY: "fallback-test-key",
      DEMO_FALLBACK_MODEL: "google/gemini-3.1-flash-lite",
      DEMO_MAX_ACTIVE: "3",
      DEMO_MAX_ACTIVE_WEBSITE: "2",
      EVALS_MASTER_KEYRING_FILE: join(dir, "keyring.json"),
      EVALS_MASTER_KEY_VERSION: "v1",
      RESEND_API_KEY: "re_test_fake",
      RESEND_FROM_EMAIL: "demo@caudals.test",
      NEXT_PUBLIC_APP_URL: "https://caudals.test",
      DEMO_APP_ORIGIN: "https://app.caudals.test",
    });
    [store, queue, fallback, runner, notify, health, status] = await Promise.all([
      import("@/lib/demo/store"), import("@/lib/demo/queue"), import("@/lib/demo/fallback"), import("@/lib/demo/runner"),
      import("@/lib/demo/notify"), import("@/lib/demo/health"), import("@/lib/demo/status"),
    ]);
    runner.demoIo.readSite = fakeReadSite(10) as never;
    runner.demoIo.askApi = fakeAskApi(5) as never;
  });

  beforeEach(async () => {
    vi.unstubAllEnvs();
    await owner.query("DELETE FROM demo.run; DELETE FROM demo.fallback_usage; DELETE FROM demo.llm_usage");
    events.length = 0;
    sent.length = 0;
    emailFailure.loseResponse = false;
    health.resetHealth();
    vi.stubEnv("DEMO_FALLBACK_DAILY_EUR", "1");
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await owner.query("DELETE FROM demo.run; DELETE FROM demo.fallback_usage; DELETE FROM demo.llm_usage");
    await owner.end();
    const { getPostgresPool } = await import("@/lib/db/client");
    await getPostgresPool().end();
  });

  let counter = 0;
  async function insert(kind: "website" | "openai_compatible", options: { queued?: boolean } = {}) {
    const n = ++counter;
    const host = `site${n}.example.test`;
    const spec = kind === "website" ? { kind, url: `https://${host}/` } as const : { kind, url: `https://api.${host}/v1/chat/completions`, model: "m" } as const;
    const id = await store.insertRun({
      tokenHash: randomBytes(32).toString("hex"), locale: "en", spec, targetHost: new URL(spec.url).hostname,
      docsUrl: `https://${host}/help`, docsHost: host, clientHash: randomBytes(32).toString("hex"), auth: false, queued: options.queued ?? true,
    });
    // queued_at has microsecond resolution; keep the order unambiguous.
    await new Promise((resolve) => setTimeout(resolve, 5));
    return id;
  }

  async function row(id: string) {
    const { rows } = await owner.query("SELECT * FROM demo.run WHERE id = $1", [id]);
    return rows[0];
  }

  async function until(check: () => Promise<boolean>, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await runner.tick();
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("timed out");
  }

  it("admits waiting runs in FIFO order within the active and website slots, and reports places in line", async () => {
    const [w1, w2, w3, a1, a2] = [await insert("website"), await insert("website"), await insert("website"), await insert("openai_compatible"), await insert("openai_compatible")];
    expect(await queue.queuePosition(w1)).toBe(1);
    expect(await queue.queuePosition(a2)).toBe(5);
    const admitted = await queue.admitWaiting();
    // Two website slots: the third website run waits and the first API run goes past it.
    expect(admitted.map((run) => run.id)).toEqual([w1, w2, a1]);
    expect(admitted.every((run) => run.first)).toBe(true);
    expect(await queue.queuePosition(w3)).toBe(1);
    expect(await queue.queuePosition(a2)).toBe(2);
    expect(await queue.queuePosition(w1)).toBeNull();
    expect(await queue.queueState()).toEqual({ waiting: 2, active: 3 });

    // A run that loses model capacity mid-way goes back to the head of the line, not the end.
    await owner.query("UPDATE demo.run SET phase = 'writing', attempts = 1 WHERE id = $1", [w1]);
    expect(await store.requeueRun(w1)).toBe(true);
    expect(await queue.queuePosition(w1)).toBe(1);
    expect((await row(w1)).attempts).toBe(0);
    const again = await queue.admitWaiting();
    expect(again.map((run) => [run.id, run.first])).toEqual([[w1, false]]);
    expect(await queue.admitWaiting()).toEqual([]);
  });

  it("lets visitors join the queue when every slot is busy, and refuses only without the queue", async () => {
    const { admit } = await import("@/lib/demo/limits");
    for (let i = 0; i < 3; i++) await insert("openai_compatible", { queued: false });
    await expect(admit("c".repeat(64), "new.example.test", "new.example.test")).resolves.toBeUndefined();
    vi.stubEnv("DEMO_QUEUE_ENABLED", "false");
    await expect(admit("c".repeat(64), "new.example.test", "new.example.test")).rejects.toThrow("busy");
    vi.stubEnv("DEMO_QUEUE_ENABLED", "true");
    vi.stubEnv("DEMO_QUEUE_MAX", "1");
    await insert("openai_compatible");
    await expect(admit("c".repeat(64), "new.example.test", "new.example.test")).rejects.toThrow("queue_full");
  });

  it("never admits more than the limits when admissions race", async () => {
    for (let i = 0; i < 10; i++) await insert("openai_compatible");
    const results = await Promise.all(Array.from({ length: 6 }, () => queue.admitWaiting()));
    const ids = results.flat().map((run) => run.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(await queue.queueState()).toEqual({ waiting: 7, active: 3 });
  });

  it("keeps fallback spend under the daily cap when reservations race, and settles real costs", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => fallback.reserveFallback(0.01, 0.05)));
    const held = results.filter(Boolean) as Array<{ day: string; eur: number }>;
    expect(held).toHaveLength(5);
    expect(await fallback.fallbackBudget(0.05)).toMatchObject({ spentEur: 0, reservedEur: 0.05, remainingEur: 0, calls: 5 });
    await Promise.all(held.map((reservation) => fallback.settleFallback(reservation, 0.004)));
    const budget = await fallback.fallbackBudget(0.05);
    expect(budget.spentEur).toBeCloseTo(0.02, 6);
    expect(budget.reservedEur).toBe(0);
    // Settled costs free the rest of the cap, and no more.
    const more = (await Promise.all(Array.from({ length: 10 }, () => fallback.reserveFallback(0.01, 0.05)))).filter(Boolean);
    expect(more).toHaveLength(3);
    expect(await fallback.reserveFallback(0.06, 0.05)).toBeNull();
  });

  it.each(["connection_lost", "server_error", "definite_rejection"])("accounts conservatively for %s before receiving a fallback reply", async (failure) => {
    vi.stubEnv("DEMO_FALLBACK_FORCE", "true");
    const messages = [{ role: "user" as const, content: "中文🔬".repeat(100) }];
    const hold = fallback.holdFor(Buffer.byteLength(JSON.stringify(messages)), 100);
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.provider).toMatchObject({ require_parameters: true, max_price: { prompt: 0.25, completion: 1.5, request: 0 } });
      if (failure === "connection_lost") throw new TypeError("connection reset after processing");
      return new Response("rejected", { status: failure === "server_error" ? 503 : 403 });
    });
    vi.stubGlobal("fetch", fetcher);
    const { chat, CapacityError } = await import("@/lib/demo/llm");
    await expect(chat({ messages, maxTokens: 100 })).rejects.toBeInstanceOf(CapacityError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await fallback.fallbackBudget()).toMatchObject({
      spentEur: failure === "definite_rejection" ? 0 : hold, reservedEur: 0, calls: 1,
    });
    vi.unstubAllGlobals();
  });

  it("answers on the fallback when the primary is rate-limited, records the model and its cost, and emits both events", async () => {
    const provider = fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK, primaryBehaviour: { fail: () => 429 }, fallbackBehaviour: { costUsd: 0.0021 } });
    vi.stubGlobal("fetch", provider.fetch);
    const id = await insert("openai_compatible");
    await until(async () => (await row(id)).phase === "done");
    const done = await row(id);
    expect(done.error_code).toBeNull();
    expect(done.model_used).toBe("google/gemini-3.1-flash-lite");
    // One question-writing call and one grading call, each settled at the reported cost.
    expect(Number(done.fallback_cost_eur)).toBeCloseTo(0.0042, 6);
    const { rows: [usage] } = await owner.query("SELECT eur, reserved_eur, calls FROM demo.fallback_usage");
    expect(Number(usage.eur)).toBeCloseTo(0.0042, 6);
    expect(Number(usage.reserved_eur)).toBe(0);
    expect(provider.stats.primaryFailed).toBeGreaterThanOrEqual(1);
    // The primary circuit opened, so the grading call went straight to the fallback.
    expect(provider.stats.primary).toBe(1);
    expect(events.filter((event) => event.id === id).map((event) => event.name)).toEqual(["demo_started", "demo_finished"]);
    expect(done.started_at).not.toBeNull();
    vi.unstubAllGlobals();
  }, 120_000);

  it("keeps all source pages when an earlier progress write completes slowly", async () => {
    vi.stubGlobal("fetch", fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK }).fetch);
    const patch = store.patchRun;
    const delayed = vi.spyOn(store, "patchRun").mockImplementation(async (id, update) => {
      if (update.pages?.length === 1) await new Promise(resolve => setTimeout(resolve, 300));
      await patch(id, update);
    });
    try {
      const id = await insert("openai_compatible");
      await until(async () => (await row(id)).phase === "done");
      expect((await row(id)).pages).toHaveLength(3);
    } finally {
      delayed.mockRestore();
      vi.unstubAllGlobals();
    }
  }, 120_000);

  it("queues the run with an honest status instead of failing when neither model can serve, then finishes it", async () => {
    // The production case on 2026-10-11: the DGX rate-limits and the fallback key refuses to spend (HTTP 403).
    let fallbackOpen = false;
    const provider = fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK, primaryBehaviour: { fail: () => 429 }, fallbackBehaviour: { fail: () => (fallbackOpen ? null : 403), costUsd: 0.001 } });
    vi.stubGlobal("fetch", provider.fetch);
    const id = await insert("openai_compatible");
    await until(async () => { const current = await row(id); return current.phase === "writing" && current.started_at === null; });
    const waiting = await row(id);
    expect(waiting.error_code).toBeNull();
    expect(waiting.phase).toBe("writing");
    expect(await queue.queuePosition(id)).toBe(1);
    expect(await status.serviceLevel()).toBe("capacity");
    // Nothing can serve, so further ticks leave it waiting.
    await runner.tick();
    expect((await row(id)).started_at).toBeNull();

    // The founder funds the key; once the cool-down passes the run resumes where it stopped.
    fallbackOpen = true;
    health.resetHealth();
    await until(async () => (await row(id)).phase === "done");
    const done = await row(id);
    expect(done.model_used).toBe("google/gemini-3.1-flash-lite");
    // Every question carries the time it was written (launch L-24: time to the first question).
    const written = (done.cases as Array<{ at?: string }>).map((item) => Date.parse(item.at ?? ""));
    expect(written.length).toBeGreaterThan(0);
    expect(written.every((at) => at >= new Date(done.created_at).getTime() && at <= new Date(done.finished_at).getTime())).toBe(true);
    expect(events.filter((event) => event.id === id).map((event) => event.name)).toEqual(["demo_started", "demo_finished"]);
    vi.unstubAllGlobals();
  }, 120_000);

  it("does not admit a run while nothing can serve it", async () => {
    vi.stubEnv("DEMO_FALLBACK_DAILY_EUR", "0.001");
    health.markDown("primary", "model_rate_limited");
    const id = await insert("openai_compatible");
    expect(await runner.admitQueued()).toBe(0);
    expect(await queue.queuePosition(id)).toBe(1);
    expect(events).toEqual([]);
  });

  it("persists lifecycle events with append-only analytics access", async () => {
    const { recordProductEvent } = await import("@/lib/analytics/funnel-events-server");
    await owner.query("DELETE FROM public.product_analytics_event WHERE path='/en/demo'");
    const payload = { target_kind: "website", locale: "en", outcome: "done" };
    for (const eventName of ["demo_started", "demo_finished"] as const) {
      expect(await recordProductEvent({ eventName, source: "server", path: "/en/demo", payload })).toEqual({ ok: true });
    }
    const { rows } = await owner.query("SELECT event_name, metadata FROM public.product_analytics_event WHERE path = '/en/demo' ORDER BY occurred_at");
    expect(rows.map(row => row.event_name)).toEqual(["demo_started", "demo_finished"]);
    expect(rows[0].metadata).toEqual({ target_kind: "website", locale: "en" });
    expect(rows[1].metadata).toEqual({ target_kind: "website", locale: "en", outcome: "done" });
    const { rows: [rights] } = await owner.query("SELECT has_table_privilege('evals_runtime','public.product_analytics_event','UPDATE') AS can_update, has_table_privilege('evals_runtime','public.product_analytics_event','DELETE') AS can_delete");
    expect(rights).toEqual({ can_update: false, can_delete: false });
    await owner.query("DELETE FROM public.product_analytics_event WHERE path = '/en/demo'");
  });

  it("emails the report only to the address given, from an encrypted request, then deletes it", async () => {
    vi.stubGlobal("fetch", fakeModelFetch({ primary: PRIMARY, fallback: FALLBACK }).fetch);
    const id = await insert("openai_compatible", { queued: false });
    const token = randomBytes(24).toString("base64url");
    expect(await notify.requestNotify(id, "visitor@example.test", token)).toBe("stored");
    const stored = await owner.query("SELECT row_to_json(r)::text AS raw, notify_requested_at FROM demo.run r WHERE id = $1", [id]);
    expect(stored.rows[0].raw).not.toContain("visitor@");
    expect(stored.rows[0].raw).not.toContain(token);
    expect(stored.rows[0].notify_requested_at).not.toBeNull();

    await until(async () => (await row(id)).phase === "done");
    await until(async () => (await row(id)).notified_at !== null);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("visitor@example.test");
    expect(sent[0].key).toBe(`demo-notify-${id}`);
    expect(sent[0].text).toContain(`https://caudals.test/en/demo#r=${id}.${token}`);
    expect(sent[0].text).not.toContain("/workspace/signup#");
    expect((await owner.query("SELECT count(*) FROM evals.self_serve_signup WHERE demo_run_id = $1", [id])).rows[0].count).toBe("0");
    const after = await owner.query("SELECT row_to_json(r)::text AS raw, notify_email_ciphertext FROM demo.run r WHERE id = $1", [id]);
    expect(after.rows[0].notify_email_ciphertext).toBeNull();
    expect(after.rows[0].raw).not.toContain("visitor@");
    // A second attempt finds nothing to send.
    expect(await notify.sendPendingNotification(id)).toBe("none");
    expect(sent).toHaveLength(1);
    // A finished run cannot take a new request.
    expect(await notify.requestNotify(id, "visitor@example.test", token)).toBe("finished");
    await owner.query("DELETE FROM evals.self_serve_signup WHERE demo_run_id = $1", [id]);
    vi.unstubAllGlobals();
  }, 120_000);

  it("retries a lost email response with the identical payload and no signup side effects", async () => {
    const id = await insert("openai_compatible");
    const token = randomBytes(24).toString("base64url");
    await notify.requestNotify(id, "retry@example.test", token);
    await store.finishRun(id, { phase: "done" });
    emailFailure.loseResponse = true;
    expect(await notify.sendPendingNotification(id)).toBe("failed");
    expect((await row(id)).notify_email_ciphertext).not.toBeNull();
    expect(await notify.sendPendingNotification(id)).toBe("sent");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect((await row(id)).notify_email_ciphertext).toBeNull();
    expect((await owner.query("SELECT count(*) FROM evals.self_serve_signup WHERE demo_run_id = $1", [id])).rows[0].count).toBe("0");
  });

  it("fails abandoned and over-waited runs with their own reasons", async () => {
    const stuck = await insert("openai_compatible", { queued: false });
    const waited = await insert("openai_compatible");
    await owner.query("UPDATE demo.run SET started_at = now() - interval '30 minutes' WHERE id = $1", [stuck]);
    await owner.query("UPDATE demo.run SET queued_at = now() - interval '7 hours' WHERE id = $1", [waited]);
    const ended = await store.sweep({ runLimitMs: 25 * 60_000, queueMaxWaitMs: 6 * 3600_000 });
    expect(Object.fromEntries(ended.map((run) => [run.id, run.error_code]))).toEqual({ [stuck]: "interrupted", [waited]: "queue_timeout" });
    // A finished run is never changed again.
    await store.patchRun(stuck, { phase: "writing" });
    expect((await row(stuck)).phase).toBe("failed");
  });

  it("lets the browser role see only what it needs to serve admitted runs", async () => {
    const id = await insert("website");
    const client = await owner.connect();
    try {
      await client.query("BEGIN; SET LOCAL ROLE evals_browser");
      const { rows } = await client.query("SELECT id, (started_at IS NULL AND queued_at IS NOT NULL) AS waiting FROM demo.run WHERE id = $1", [id]);
      expect(rows[0].waiting).toBe(true);
      await expect(client.query("SELECT notify_email_ciphertext FROM demo.run LIMIT 1")).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
