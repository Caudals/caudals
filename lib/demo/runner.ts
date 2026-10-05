import "server-only";
import { randomUUID } from "node:crypto";
import { detectSourceLanguage } from "@/lib/evals/generation/auto-draft";
import { acceptTest, buildExcerpts, completeObjects, DEMO_CASES, generationMessages, type DemoCase } from "./generate";
import { judgeMessages, lexicalVerdict, parseJudgement, precheck, summarize, type DemoAnswer, type DemoVerdict } from "./judge";
import { chat, ModelError, QuotaError } from "./llm";
import { appendCase, claimRun, countLlmCall, getRun, patchRun, renewLease, setAnswer, sweep, type RunRow } from "./store";
import { askApi, type TargetSecrets, type TargetSpec } from "./target";
import { readSite, WebError, type DemoPage } from "./web";

/**
 * The demo engine, inside the web process. Runs advance through phases
 * (reading → writing → asking → grading → done) under a 45-second lease, so a
 * restarted process picks unfinished runs up again; the browser worker does
 * the website parts and reports through the same row. API credentials exist
 * only in this process's memory and are dropped when the run ends.
 */

const MAX_PARALLEL = 3;
const MIN_TEXT = 1_200;

declare global {
  var __caudalsDemoRunner: { owner: string; active: Set<string>; started: boolean; lastSweep: number; secrets: Map<string, { secrets: TargetSecrets; at: number }> } | undefined;
}

function state() {
  globalThis.__caudalsDemoRunner ??= { owner: randomUUID(), active: new Set(), started: false, lastSweep: 0, secrets: new Map() };
  return globalThis.__caudalsDemoRunner;
}

export function demoEnabled() {
  return process.env.DEMO_ENABLED === "true";
}

export function rememberSecrets(id: string, secrets: TargetSecrets) {
  if (Object.keys(secrets).length) state().secrets.set(id, { secrets, at: Date.now() });
}

/** Starts the loop once per process; called from the demo API routes. */
export function ensureDemoRunner() {
  const s = state();
  if (s.started || !demoEnabled()) return;
  s.started = true;
  const tick = async () => {
    try {
      if (Date.now() - s.lastSweep > 5 * 60_000) {
        s.lastSweep = Date.now();
        await sweep();
        for (const [id, entry] of s.secrets) if (Date.now() - entry.at > 30 * 60_000) s.secrets.delete(id);
      }
      while (s.active.size < MAX_PARALLEL) {
        const run = await claimRun(s.owner, [...s.active]);
        if (!run) break;
        s.active.add(run.id);
        void advance(run).finally(() => s.active.delete(run.id));
      }
    } catch (error) {
      console.error("demo_runner_tick_failed", { error_type: error instanceof Error ? error.name : typeof error });
    }
  };
  setInterval(() => void tick(), 1_500).unref?.();
  void tick();
}

/** A failure the visitor can act on; the code maps to a sentence in the UI. */
class Stop extends Error {}

async function advance(initial: RunRow) {
  const s = state();
  const heartbeat = setInterval(() => void renewLease(initial.id, s.owner).catch(() => {}), 15_000);
  try {
    let run: RunRow | null = initial;
    while (run && run.phase !== "done" && run.phase !== "failed") {
      if (run.phase === "reading") await reading(run);
      else if (run.phase === "writing") await writing(run);
      else if (run.phase === "asking") await asking(run);
      else if (run.phase === "grading") await grading(run);
      run = await getRun(initial.id);
    }
  } catch (error) {
    const code = error instanceof Stop || error instanceof WebError || error instanceof ModelError ? error.message
      : error instanceof QuotaError ? "capacity" : "engine_failed";
    if (!(error instanceof Stop) && !(error instanceof WebError)) console.error("demo_run_failed", { run_id: initial.id, code });
    await patchRun(initial.id, { phase: "failed", error_code: code.replace(/[^a-z0-9_]/g, "_").slice(0, 64), finished: true }).catch(() => {});
  } finally {
    clearInterval(heartbeat);
    const current = await getRun(initial.id).catch(() => null);
    if (!current || current.phase === "done" || current.phase === "failed") s.secrets.delete(initial.id);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(id: string, done: (run: RunRow) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await getRun(id);
    if (!run) throw new Stop("expired");
    if (done(run)) return run;
    await sleep(2_000);
  }
  return getRun(id);
}

/* --------------------------------------------------------------- reading --- */

async function reading(run: RunRow) {
  let pages: DemoPage[] = [];
  let lang: string | null = null;
  let readError: string | null = null;
  try {
    const result = await readSite(run.docs_url, {
      locale: run.locale,
      onPage: (page) => {
        pages.push(page);
        void patchRun(run.id, { pages: [...pages] }).catch(() => {});
      },
    });
    pages = result.pages;
    lang = result.lang;
  } catch (error) {
    readError = error instanceof WebError ? error.message : "site_unreachable";
  }
  let total = pages.reduce((sum, page) => sum + page.text.length, 0);
  // Pages built in the browser need the browser worker to read them.
  if (total < MIN_TEXT && process.env.DEMO_BROWSER_ENABLED === "true" && readError !== "destination_denied" && readError !== "destination_invalid") {
    await patchRun(run.id, { browser_docs: "queued" });
    const after = await waitFor(run.id, (row) => row.browser_docs === "done" || row.browser_docs === "failed", 150_000);
    const captured = (after?.browser_pages ?? []).filter((page) => page.text.length >= 200);
    if (captured.length) { pages = captured.slice(0, 6); total = pages.reduce((sum, page) => sum + page.text.length, 0); }
  }
  if (!pages.length) throw new Stop(readError ?? "site_empty");
  if (total < MIN_TEXT) throw new Stop("site_thin");
  const detected = detectSourceLanguage(pages.map((page) => page.text));
  const language = detected ?? (lang?.startsWith("es") ? "es" : lang?.startsWith("en") ? "en" : run.locale);
  await patchRun(run.id, { pages, language, phase: "writing" });
}

/* --------------------------------------------------------------- writing --- */

async function writing(run: RunRow) {
  // Free model calls are the scarcest resource: a website run writes questions
  // only once the browser worker has found the chat to ask them.
  if (run.target_kind === "website" && process.env.DEMO_BROWSER_ENABLED === "true") {
    const ready = await waitFor(run.id, (row) => row.target_config?.recipe_detected === true || row.browser_chat === "failed" || row.browser_chat === "done", 150_000);
    if (!ready || ready.browser_chat === "failed") throw new Stop(ready?.browser_error ?? "chat_not_found");
    if (ready.target_config?.recipe_detected !== true) throw new Stop("chat_not_found");
  }
  const pages = run.pages;
  const excerpts = buildExcerpts(pages);
  if (excerpts.length < 3) throw new Stop("site_thin");
  const accepted: DemoCase[] = [...run.cases];
  const language = run.language ?? run.locale;
  let seen = 0;
  const take = async (objects: unknown[]) => {
    for (const raw of objects.slice(seen)) {
      seen++;
      if (accepted.length >= DEMO_CASES) return;
      const item = acceptTest(raw, excerpts, accepted, `q${accepted.length + 1}`);
      if (item) { accepted.push(item); await appendCase(run.id, item); }
    }
  };
  for (let round = 0; round < 2 && accepted.length < 4; round++) {
    seen = 0;
    let pending = Promise.resolve();
    const messages = generationMessages(excerpts, pages, language, DEMO_CASES - accepted.length + (round ? 2 : 1));
    if (accepted.length) messages[1].content += `\n\nDo not repeat these questions:\n${accepted.map((item) => `- ${item.question}`).join("\n")}`;
    await countLlmCall(run.id);
    const result = await chat({
      messages, maxTokens: 4_500, temperature: 0.3, timeoutMs: 150_000,
      onText: (text) => { const objects = completeObjects(text); if (objects.length > seen) pending = pending.then(() => take(objects)); },
      // A reply with no test objects at all (a model that only "thinks") moves to the next model.
      accept: (text) => completeObjects(text).length > 0,
    }).catch((error) => {
      console.error("demo_generation_failed", { run_id: run.id, code: error instanceof Error ? error.message : "unknown" });
      if (error instanceof QuotaError || accepted.length === 0) throw error;
      return null;
    });
    await pending;
    if (result) await take(completeObjects(result.text));
  }
  if (accepted.length < 3) throw new Stop("generation_failed");
  await patchRun(run.id, { phase: "asking" });
}

/* ---------------------------------------------------------------- asking --- */

async function asking(run: RunRow) {
  if (run.target_kind === "website") return askWebsite(run);
  const entry = state().secrets.get(run.id);
  const config = run.target_config as { model?: string; template?: unknown; slot?: Array<string | number>; response_path?: Array<string | number> | null; auth?: boolean };
  if (config.auth && !entry) throw new Stop("interrupted");
  let spec: Exclude<TargetSpec, { kind: "website" }> = run.target_kind === "openai_compatible"
    ? { kind: "openai_compatible", url: run.target_url, model: config.model ?? "" }
    : { kind: "https_json", url: run.target_url, template: config.template, slot: config.slot ?? [], responsePath: config.response_path ?? null };
  let consecutive = 0;
  for (const item of run.cases) {
    if (run.answers[item.id]) continue;
    let answer = await askApi(spec, entry?.secrets ?? {}, item.question);
    // A rate-limited system gets two polite retries before the answer counts as missing.
    for (const wait of [5_000, 15_000]) {
      if (answer.error !== "target_rate_limited") break;
      await sleep(wait);
      answer = await askApi(spec, entry?.secrets ?? {}, item.question);
    }
    if (spec.kind === "https_json" && !spec.responsePath && answer.responsePath && !answer.error) {
      spec = { ...spec, responsePath: answer.responsePath };
      await patchRun(run.id, { target_config: { ...config, response_path: answer.responsePath } });
    }
    await setAnswer(run.id, item.id, { text: answer.text.slice(0, 6_000), ms: answer.ms, error: answer.error });
    consecutive = answer.error ? consecutive + 1 : 0;
    // A system that refuses every request is a connection problem, not eight failed answers.
    if (consecutive >= 2 && Object.values((await getRun(run.id))?.answers ?? {}).every((value) => value.error)) throw new Stop(answer.error ?? "target_unreachable");
    await sleep(1_000);
  }
  await patchRun(run.id, { phase: "grading" });
}

async function askWebsite(run: RunRow) {
  const final = await waitFor(run.id, (row) => row.browser_chat === "done" || row.browser_chat === "failed" || row.cases.every((item) => row.answers[item.id]), 9 * 60_000);
  if (!final) throw new Stop("expired");
  const answered = final.cases.filter((item) => final.answers[item.id] && !final.answers[item.id].error).length;
  if (final.browser_chat === "failed" && answered === 0) throw new Stop(final.browser_error ?? "chat_not_found");
  for (const item of final.cases) if (!final.answers[item.id]) await setAnswer(run.id, item.id, { text: "", ms: 0, error: "timeout" });
  await patchRun(run.id, { phase: "grading" });
}

/* --------------------------------------------------------------- grading --- */

async function grading(run: RunRow) {
  const locale = run.locale;
  const verdicts: Record<string, DemoVerdict> = { ...run.verdicts };
  const pending: Array<{ item: DemoCase; answer: DemoAnswer }> = [];
  for (const item of run.cases) {
    if (verdicts[item.id]) continue;
    const answer = run.answers[item.id];
    const early = precheck(item, answer, locale);
    if (early) verdicts[item.id] = early;
    else pending.push({ item, answer });
  }
  if (pending.length) {
    let judged = new Map<string, DemoVerdict>();
    try {
      await countLlmCall(run.id);
      // A reply that grades fewer than half of the answers is retried on the next model.
      const result = await chat({
        messages: judgeMessages(pending, locale), maxTokens: 3_500, temperature: 0, json: true, timeoutMs: 120_000,
        accept: (text) => parseJudgement(text).size * 2 >= pending.length,
      });
      judged = parseJudgement(result.text);
    } catch (error) {
      if (!(error instanceof QuotaError) && !(error instanceof ModelError)) throw error;
      console.error("demo_judge_failed", { run_id: run.id, code: error.message });
    }
    for (const { item, answer } of pending) verdicts[item.id] = judged.get(item.id) ?? lexicalVerdict(item, answer, locale);
  }
  await patchRun(run.id, { verdicts, summary: summarize(run.cases, verdicts), phase: "done", finished: true });
}
