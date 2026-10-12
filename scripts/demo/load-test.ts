/**
 * Load test for the public demo's queue and fallback model (launch package L-03).
 *
 * Local: the real engine, queue and cap accounting against the disposable
 * database, with fake pages, a fake assistant and a fake model provider whose
 * primary rate-limits. Time is compressed: `--runs 30 --minutes 3` stands for
 * 30 demos in an hour. No network, no spend.
 *
 *   eval "$(scripts/evals/test-db.sh up)"
 *   node --conditions=react-server --import tsx scripts/demo/load-test.ts --local --runs 30 --minutes 3 --primary-429 0.5
 *
 * Production: real demos through the public API, at most three, against a
 * target Caudals owns (caudals.com or app.caudals.com only; never a third
 * party). The target can come from stdin so a credential in a curl command
 * never reaches the shell history or the output. No URL, token or address is
 * printed.
 *
 *   node --import tsx scripts/demo/load-test.ts --base https://caudals.com --runs 2 --docs https://caudals.com/en --target-stdin < target.txt
 *   (add --notify-email-env NAME to ask for the report by email at the address in $NAME)
 */
import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";

const { values: args } = parseArgs({
  options: {
    local: { type: "boolean", default: false },
    runs: { type: "string", default: "1" },
    minutes: { type: "string", default: "3" },
    "primary-429": { type: "string", default: "0.5" },
    "fallback-fail": { type: "string", default: "0" },
    "cap-eur": { type: "string", default: "5" },
    "min-success": { type: "string", default: "0.9" },
    "website-share": { type: "string", default: "0" },
    base: { type: "string", default: "https://caudals.com" },
    target: { type: "string" },
    "target-stdin": { type: "boolean", default: false },
    docs: { type: "string" },
    locale: { type: "string", default: "en" },
    interval: { type: "string", default: "20" },
    "notify-email-env": { type: "string" },
    "timeout-minutes": { type: "string", default: "30" },
  },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
};
/** Deterministic pseudo-random draws, so a local run is reproducible. */
function draws(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

/* ------------------------------------------------------------------ local --- */

async function local() {
  const url = process.env.EVALS_TEST_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  // Only ever the disposable database on this machine.
  if (!/@(127\.0\.0\.1|localhost):\d+\//.test(url)) throw new Error("Local mode needs the disposable database: eval \"$(scripts/evals/test-db.sh up)\" first.");
  const runs = Math.max(1, Math.min(200, Number(args.runs)));
  const spreadMs = Math.max(10, Number(args.minutes) * 60) * 1000;
  const primaryRate = Number(args["primary-429"]);
  const fallbackFailRate = Number(args["fallback-fail"]);
  const capEur = Number(args["cap-eur"]);
  const websiteShare = Number(args["website-share"]);
  const PRIMARY = "http://primary.load.test/v1", FALLBACK = "https://fallback.load.test/api/v1";
  Object.assign(process.env, {
    DATABASE_URL: url, DEMO_SECRET: process.env.DEMO_SECRET ?? "load-test-secret", DEMO_ENABLED: "true",
    DEMO_QUEUE_ENABLED: "true", DEMO_FALLBACK_ENABLED: "true", DEMO_ENDPOINT: PRIMARY, DEMO_MODELS: "fake-dgx-model",
    DEMO_FALLBACK_ENDPOINT: FALLBACK, DEMO_FALLBACK_API_KEY: "load-test-key", DEMO_FALLBACK_DAILY_EUR: String(capEur),
    DEMO_DAILY_MODEL_CALLS: "100000", DEMO_BROWSER_ENABLED: "false",
  });
  const { fakeAskApi, fakeModelFetch, fakeReadSite } = await import("./fake-demo");
  const [{ getPostgresPool }, store, runner, fallback, config] = await Promise.all([
    import("../../lib/db/client"), import("../../lib/demo/store"), import("../../lib/demo/runner"), import("../../lib/demo/fallback"), import("../../lib/demo/config"),
  ]);
  const random = draws(42);
  const provider = fakeModelFetch({
    primary: PRIMARY, fallback: FALLBACK,
    primaryBehaviour: { latencyMs: 1_500, fail: () => (random() < primaryRate ? 429 : null) },
    fallbackBehaviour: { latencyMs: 800, costUsd: 0.004, fail: () => (random() < fallbackFailRate ? 503 : null) },
  });
  globalThis.fetch = provider.fetch;
  runner.demoIo.readSite = fakeReadSite(1_500) as never;
  runner.demoIo.askApi = fakeAskApi(300) as never;
  const db = getPostgresPool();
  const batch = randomBytes(4).toString("hex");

  // Website runs need the browser worker, which is not part of this test.
  if (websiteShare > 0) console.warn("Website runs are not simulated locally; --website-share is ignored.");
  const ids: string[] = [];
  let maxActive = 0;
  let stop = false;
  const engine = (async () => {
    while (!stop) {
      await runner.tick().catch((error) => console.error("tick_failed", error instanceof Error ? error.message : error));
      const { rows } = await db.query<{ active: string }>(`SELECT count(*) AS active FROM demo.run WHERE phase NOT IN ('done','failed') AND ${store.STARTED} AND id = ANY($1::uuid[])`, [ids]);
      maxActive = Math.max(maxActive, Number(rows[0].active));
      await sleep(500);
    }
  })();

  const started = Date.now();
  for (let i = 0; i < runs; i++) {
    const at = started + (spreadMs * i) / runs;
    if (at > Date.now()) await sleep(at - Date.now());
    const host = `load-${batch}-${i}.example.test`;
    const id = await store.insertRun({
      tokenHash: randomBytes(32).toString("hex"), locale: i % 2 ? "es" : "en",
      spec: { kind: "openai_compatible", url: `https://api.${host}/v1/chat/completions`, model: "assistant" },
      targetHost: `api.${host}`, docsUrl: `https://${host}/help`, docsHost: host, clientHash: randomBytes(32).toString("hex"), auth: false, queued: true,
    });
    ids.push(id);
    await runner.admitQueued();
  }
  const deadline = Date.now() + Number(args["timeout-minutes"]) * 60_000;
  for (;;) {
    const { rows } = await db.query<{ open: string }>("SELECT count(*) AS open FROM demo.run WHERE id = ANY($1::uuid[]) AND phase NOT IN ('done','failed')", [ids]);
    if (Number(rows[0].open) === 0 || Date.now() > deadline) break;
    await sleep(1_000);
  }
  stop = true;
  await engine;

  const { rows } = await db.query<{ phase: string; error_code: string | null; wait: number | null; duration: number | null; model_used: string | null; cost: string }>(
    `SELECT phase, error_code, extract(epoch FROM started_at - queued_at)::float8 AS wait, extract(epoch FROM finished_at - started_at)::float8 AS duration, model_used, fallback_cost_eur AS cost
     FROM demo.run WHERE id = ANY($1::uuid[])`, [ids]);
  const budget = await fallback.fallbackBudget(capEur);
  const done = rows.filter((row) => row.phase === "done").length;
  const failures: Record<string, number> = {};
  for (const row of rows) if (row.phase !== "done") failures[row.error_code ?? row.phase] = (failures[row.error_code ?? row.phase] ?? 0) + 1;
  const models: Record<string, number> = {};
  for (const row of rows) for (const model of (row.model_used ?? "none").split(",")) models[model] = (models[model] ?? 0) + 1;
  const waits = rows.map((row) => row.wait).filter((value): value is number => value !== null);
  const durations = rows.map((row) => row.duration).filter((value): value is number => value !== null);
  const spentByRuns = rows.reduce((sum, row) => sum + Number(row.cost), 0);
  const report = {
    mode: "local",
    runs, done, successRate: done / runs, failures,
    wallClockSeconds: Math.round((Date.now() - started) / 1000),
    queueWaitSeconds: { p50: percentile(waits, 0.5), p90: percentile(waits, 0.9), max: percentile(waits, 1) },
    runSeconds: { p50: percentile(durations, 0.5), p90: percentile(durations, 0.9) },
    maxActiveObserved: maxActive, maxActiveAllowed: config.maxActive(),
    models,
    provider: provider.stats,
    fallbackEur: { cap: capEur, settled: budget.spentEur, open: budget.reservedEur, recordedOnRuns: Number(spentByRuns.toFixed(6)) },
  };
  console.log(JSON.stringify(report, null, 2));
  await db.query("DELETE FROM demo.run WHERE id = ANY($1::uuid[])", [ids]).catch(() => {});
  await db.end();
  const ok = report.successRate >= Number(args["min-success"]) && budget.spentEur + budget.reservedEur <= capEur + 1e-9 && maxActive <= config.maxActive();
  if (!ok) { console.error("Load test failed its thresholds."); process.exitCode = 1; }
}

/* ------------------------------------------------------------- production --- */

/** Caudals' own hosts. The demo is never pointed at anyone else's site from here. */
function owned(host: string) {
  return host === "caudals.com" || host.endsWith(".caudals.com");
}

function hostOfTarget(target: string) {
  const text = target.trim();
  const url = /^curl\s/i.test(text) ? text.match(/https:\/\/[^\s'"]+/)?.[0] : /^[a-z]+:\/\//i.test(text) ? text : `https://${text}`;
  try { return new URL(url ?? "").hostname; } catch { return ""; }
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function production() {
  const { search } = await import("../../components/demo/pow");
  const base = new URL(args.base!);
  if (!owned(base.hostname)) throw new Error("--base must be a Caudals host.");
  const runs = Number(args.runs);
  if (!Number.isInteger(runs) || runs < 1 || runs > 3) throw new Error("Production runs are capped at three.");
  const target = args["target-stdin"] ? await readStdin() : args.target ?? "";
  const docs = args.docs ?? `${base.origin}/${args.locale}`;
  if (!owned(hostOfTarget(target))) throw new Error("The target must be on caudals.com.");
  if (!owned(new URL(docs).hostname)) throw new Error("--docs must be on caudals.com.");
  const notifyEmail = args["notify-email-env"] ? process.env[args["notify-email-env"]]?.trim() : undefined;
  if (args["notify-email-env"] && !notifyEmail) throw new Error(`$${args["notify-email-env"]} is empty.`);
  const origin = base.origin;
  const headers = { origin, referer: `${origin}/${args.locale}/demo`, "user-agent": "CaudalsDemoLoadTest/1.0 (+https://caudals.com)" };

  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < runs; i++) {
    if (i) await sleep(Number(args.interval) * 1000);
    const intro = await (await fetch(`${origin}/api/demo/challenge`, { headers, cache: "no-store" })).json() as { open: boolean; reason: string | null; service?: string; queue?: unknown; challenge: { salt: string; bits: number; expires: number; signature: string } | null };
    console.log(JSON.stringify({ run: i + 1, event: "status", open: intro.open, service: intro.service ?? null, queue: intro.queue ?? null }));
    if (!intro.challenge) { results.push({ run: i + 1, outcome: "not_started", reason: intro.reason }); continue; }
    const nonce = String(search(intro.challenge.salt, intro.challenge.bits));
    const start = Date.now();
    const response = await fetch(`${origin}/api/demo/runs`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ target, docs, locale: args.locale, challenge: intro.challenge, nonce }),
    });
    const created = await response.json().catch(() => ({})) as { id?: string; token?: string; queued?: boolean; error?: { code?: string } };
    if (!response.ok || !created.id || !created.token) {
      console.log(JSON.stringify({ run: i + 1, event: "refused", status: response.status, code: created.error?.code ?? null }));
      results.push({ run: i + 1, outcome: "refused", code: created.error?.code ?? null });
      continue;
    }
    const auth = { ...headers, "x-demo-token": created.token };
    console.log(JSON.stringify({ run: i + 1, event: "created", id: created.id, queued: created.queued ?? false }));
    if (notifyEmail && i === 0) {
      const notify = await fetch(`${origin}/api/demo/runs/${created.id}/notify`, {
        method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ email: notifyEmail, consent: true }),
      });
      console.log(JSON.stringify({ run: i + 1, event: "notify_requested", status: notify.status }));
    }
    let last = "";
    let view: Record<string, any> = {};
    const deadline = Date.now() + Number(args["timeout-minutes"]) * 60_000;
    while (Date.now() < deadline) {
      const poll = await fetch(`${origin}/api/demo/runs/${created.id}`, { headers: auth, cache: "no-store" });
      if (poll.ok) {
        view = await poll.json();
        const line = JSON.stringify({ phase: view.phase, error: view.error, position: view.queue?.position ?? null, service: view.service, cases: view.cases?.length ?? 0, answered: view.cases?.filter((item: { answer: unknown }) => item.answer).length ?? 0 });
        if (line !== last) { console.log(JSON.stringify({ run: i + 1, t: Math.round((Date.now() - start) / 1000), ...JSON.parse(line) })); last = line; }
        if (view.phase === "done" || view.phase === "failed") break;
      }
      await sleep(3_000);
    }
    results.push({
      run: i + 1, id: created.id, outcome: view.phase, error: view.error ?? null,
      seconds: Math.round((Date.now() - start) / 1000),
      queueWaitSeconds: view.startedAt ? Math.round((Date.parse(view.startedAt) - Date.parse(view.createdAt)) / 1000) : null,
      scored: view.summary?.scored ?? null, correct: view.summary?.correct ?? null, notify: view.notify ?? null,
    });
  }
  const done = results.filter((result) => result.outcome === "done").length;
  console.log(JSON.stringify({ mode: "production", runs, done, results }, null, 2));
  if (done < runs) process.exitCode = 1;
}

(args.local ? local() : production()).catch((error) => {
  console.error(error instanceof Error ? error.message : "load_test_failed");
  process.exitCode = 1;
});
