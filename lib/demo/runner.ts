import "server-only";
import { randomUUID } from "node:crypto";
import { detectSourceLanguage } from "@/lib/evals/generation/auto-draft";
import { disclosureJudgeMessages, disclosureTurn, finalizeDisclosure, needsDisclosureJudge, OPENING_MESSAGE, parseDisclosureJudgement, PERSON_QUESTION, type DisclosureResult, type JudgeVerdict } from "@/lib/evals/scoring/disclosure";
import { CHAT_DETECTION_MS, PHASE_LIMIT_MS, queueEnabled, queueMaxWaitMs, RUN_LIMIT_MS } from "./config";
import { demoFinished, demoStarted } from "./events";
import { acceptTest, buildExcerpts, completeObjects, DEMO_CASES, generationMessages, type DemoCase } from "./generate";
import { isAvailabilityCode } from "./health";
import { judgeMessages, lexicalVerdict, parseJudgement, precheck, summarize, type DemoAnswer, type DemoVerdict } from "./judge";
import { capacityOpen } from "./limits";
import { CapacityError, chat, ModelError, QuotaError, type ChatUsage } from "./llm";
import { pendingNotifications, sendPendingNotification } from "./notify";
import { admitWaiting, hasWaiting } from "./queue";
import { appendCase, claimRun, countLlmCall, finishRun, getRun, patchRun, recordModelUse, renewLease, requeueRun, setAnswer, setDisclosureCapture, sweep, type RunRow } from "./store";
import { askApi, type TargetSecrets, type TargetSpec } from "./target";
import { readSite, WebError, type DemoPage } from "./web";

/**
 * The demo engine, inside the web process. A run waits in the queue
 * (lib/demo/queue.ts) until a slot and a model are free, then advances through
 * phases (reading → writing → asking → grading → done) under a 45-second
 * lease, so a restarted process picks unfinished runs up again; the browser
 * worker does the website parts and reports through the same row. Each phase
 * has its own time limit. A run that loses model capacity mid-way goes back to
 * the head of the queue instead of failing. API credentials exist only in this
 * process's memory and are dropped when the run ends.
 */

const MAX_PARALLEL = 3;
const MIN_TEXT = 1_200;

/** The engine's network edges. Tests and the local load test replace them with fakes. */
export const demoIo = { readSite, askApi };

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

/** Admits waiting runs while slots and model capacity allow, and records their start. */
export async function admitQueued() {
  if (!(await hasWaiting()) || !(await capacityOpen())) return 0;
  const admitted = await admitWaiting();
  for (const run of admitted) if (run.first) demoStarted(run);
  return admitted.length;
}

/** A run that started at once (no queue) records its start here. */
export function recordStart(run: RunRow) {
  demoStarted(run);
}

/** One engine step: housekeeping, admission and claiming. Exported for tests and the load test. */
export async function tick() {
  const s = state();
  if (Date.now() - s.lastSweep > 5 * 60_000) {
    s.lastSweep = Date.now();
    for (const run of await sweep({ runLimitMs: RUN_LIMIT_MS, queueMaxWaitMs: queueMaxWaitMs() })) await ended(run);
    for (const id of await pendingNotifications()) await sendPendingNotification(id);
    // Queued API demos still need their in-memory credential when admitted.
    // Never expire it before the allowed queue wait plus execution window.
    const secretLifetime = queueEnabled() ? queueMaxWaitMs() + RUN_LIMIT_MS : 30 * 60_000;
    for (const [id, entry] of s.secrets) if (Date.now() - entry.at > secretLifetime) s.secrets.delete(id);
  }
  await admitQueued();
  while (s.active.size < MAX_PARALLEL) {
    const run = await claimRun(s.owner, [...s.active]);
    if (!run) break;
    s.active.add(run.id);
    void advance(run)
      .catch((error) => console.error("demo_runner_advance_failed", { run_id: run.id, error_type: error instanceof Error ? error.name : typeof error }))
      .finally(() => s.active.delete(run.id));
  }
}

/** Starts the loop once per process; called from the demo API routes. */
export function ensureDemoRunner() {
  const s = state();
  if (s.started || !demoEnabled()) return;
  s.started = true;
  const run = async () => {
    try { await tick(); } catch (error) {
      console.error("demo_runner_tick_failed", { error_type: error instanceof Error ? error.name : typeof error });
    }
  };
  setInterval(() => void run(), 1_500).unref?.();
  void run();
}

/** Runs in progress in this process, for the load test. */
export function activeRuns() {
  return state().active.size;
}

/** A failure the visitor can act on; the code maps to a sentence in the UI. */
class Stop extends Error {}

/** Whether a failure means "no model can serve now" rather than "this run cannot work". */
export function isCapacityFailure(error: unknown) {
  return error instanceof CapacityError || error instanceof QuotaError || (error instanceof ModelError && isAvailabilityCode(error.message));
}

function failureCode(error: unknown) {
  const code = error instanceof Stop || error instanceof WebError || error instanceof ModelError ? error.message
    : error instanceof QuotaError || error instanceof CapacityError ? "capacity" : "engine_failed";
  return code.replace(/[^a-z0-9_]/g, "_").slice(0, 64);
}

/** The run ended (done or failed): its event, and its report email if one was requested. */
async function ended(run: RunRow | null) {
  if (!run) return;
  demoFinished(run);
  if (run.notify_requested_at) await sendPendingNotification(run.id).catch(() => {});
}

async function advance(initial: RunRow) {
  const s = state();
  const heartbeat = setInterval(() => void renewLease(initial.id, s.owner).catch(() => {}), 15_000);
  try {
    let run: RunRow | null = initial;
    while (run && run.phase !== "done" && run.phase !== "failed") {
      const phase = run.phase as keyof typeof PHASE_LIMIT_MS;
      const current: RunRow = run;
      await withLimit(phase, (signal) => {
        if (phase === "reading") return reading(current, signal);
        if (phase === "writing") return writing(current, signal);
        if (phase === "asking") return asking(current, signal);
        return grading(current, signal);
      });
      run = await getRun(initial.id);
    }
  } catch (error) {
    if (isCapacityFailure(error) && queueEnabled()) {
      // Nothing can answer now: wait at the head of the queue instead of failing.
      console.warn("demo_run_requeued", { run_id: initial.id, code: error instanceof CapacityError ? error.code : error instanceof Error ? error.message : "unknown" });
      if (await requeueRun(initial.id)) return;
    }
    const code = failureCode(error);
    if (!(error instanceof Stop) && !(error instanceof WebError)) console.error("demo_run_failed", { run_id: initial.id, code });
    await ended(await finishRun(initial.id, { phase: "failed", error_code: code }).catch(() => null));
  } finally {
    clearInterval(heartbeat);
    const current = await getRun(initial.id).catch(() => null);
    if (!current || current.phase === "done" || current.phase === "failed") s.secrets.delete(initial.id);
  }
}

/** Runs one phase under its time limit; work that overruns is aborted and fails the run as `timeout_<phase>`. */
async function withLimit(phase: keyof typeof PHASE_LIMIT_MS, work: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Stop(`timeout_${phase}`)); }, PHASE_LIMIT_MS[phase]);
  });
  try {
    await Promise.race([work(controller.signal), limit]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(id: string, done: (run: RunRow) => boolean, timeoutMs: number, signal?: AbortSignal) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !signal?.aborted) {
    const run = await getRun(id);
    if (!run) throw new Stop("expired");
    if (done(run)) return run;
    await sleep(2_000);
  }
  return getRun(id);
}

/**
 * Waits for the browser worker: up to `workMs` once it has taken the job
 * (`running`), and for as long as the phase allows while it is still queued
 * behind other demos.
 */
function browserDone(column: "browser_docs" | "browser_chat", done: (run: RunRow) => boolean, workMs: number) {
  let takenAt: number | null = null;
  return (run: RunRow) => {
    if (done(run)) return true;
    if (run[column] === "running" && takenAt === null) takenAt = Date.now();
    return takenAt !== null && Date.now() - takenAt > workMs;
  };
}

const record = (id: string) => (use: ChatUsage) => recordModelUse(id, use).catch(() => {});

/* --------------------------------------------------------------- reading --- */

async function reading(run: RunRow, signal: AbortSignal) {
  let pages: DemoPage[] = [];
  let pageUpdates = Promise.resolve();
  let lang: string | null = null;
  let readError: string | null = null;
  try {
    const result = await demoIo.readSite(run.docs_url, {
      locale: run.locale,
      signal,
      onPage: (page) => {
        pages.push(page);
        const snapshot = [...pages];
        pageUpdates = pageUpdates.then(() => patchRun(run.id, { pages: snapshot })).catch(() => {});
      },
    });
    pages = result.pages;
    lang = result.lang;
  } catch (error) {
    readError = error instanceof WebError ? error.message : "site_unreachable";
  }
  // A delayed partial snapshot must not overwrite the final source pages
  // after writing starts (and turn a usable site into a false site_thin).
  await pageUpdates;
  let total = pages.reduce((sum, page) => sum + page.text.length, 0);
  // Pages built in the browser need the browser worker to read them.
  if (total < MIN_TEXT && process.env.DEMO_BROWSER_ENABLED === "true" && readError !== "destination_denied" && readError !== "destination_invalid") {
    await patchRun(run.id, { browser_docs: "queued" });
    const read = (row: RunRow) => row.browser_docs === "done" || row.browser_docs === "failed";
    const after = await waitFor(run.id, browserDone("browser_docs", read, 150_000), PHASE_LIMIT_MS.reading, signal);
    const captured = (after?.browser_pages ?? []).filter((page) => page.text.length >= 200);
    if (captured.length) { pages = captured.slice(0, 6); total = pages.reduce((sum, page) => sum + page.text.length, 0); }
  }
  if (signal.aborted) return;
  if (!pages.length) throw new Stop(readError ?? "site_empty");
  if (total < MIN_TEXT) throw new Stop("site_thin");
  const detected = detectSourceLanguage(pages.map((page) => page.text));
  const language = detected ?? (lang?.startsWith("es") ? "es" : lang?.startsWith("en") ? "en" : run.locale);
  await patchRun(run.id, { pages, language, phase: "writing" });
}

/* --------------------------------------------------------------- writing --- */

async function writing(run: RunRow, signal: AbortSignal) {
  // Model calls are the scarcest resource: a website run writes questions
  // only once the browser worker has found the chat to ask them.
  if (run.target_kind === "website" && process.env.DEMO_BROWSER_ENABLED === "true") {
    const found = (row: RunRow) => row.target_config?.recipe_detected === true || row.browser_chat === "failed" || row.browser_chat === "done";
    const ready = await waitFor(run.id, browserDone("browser_chat", found, CHAT_DETECTION_MS), PHASE_LIMIT_MS.writing, signal);
    if (signal.aborted) return;
    if (!ready || ready.browser_chat === "failed") throw new Stop(ready?.browser_error ?? "chat_not_found");
    if (ready.target_config?.recipe_detected !== true) throw new Stop("chat_not_found");
  }
  const pages = run.pages;
  const excerpts = buildExcerpts(pages);
  if (excerpts.length < 3) throw new Stop("site_thin");
  const accepted: DemoCase[] = [...run.cases];
  const language = run.language ?? run.locale;
  let seen = 0;
  let capacity: unknown = null;
  const take = async (objects: unknown[]) => {
    for (const raw of objects.slice(seen)) {
      seen++;
      if (accepted.length >= DEMO_CASES) return;
      const item = acceptTest(raw, excerpts, accepted, `q${accepted.length + 1}`);
      if (item) { accepted.push(item); await appendCase(run.id, item); }
    }
  };
  for (let round = 0; round < 2 && accepted.length < 4 && !signal.aborted; round++) {
    seen = 0;
    let pending = Promise.resolve();
    const messages = generationMessages(excerpts, pages, language, DEMO_CASES - accepted.length + (round ? 2 : 1));
    if (accepted.length) messages[1].content += `\n\nDo not repeat these questions:\n${accepted.map((item) => `- ${item.question}`).join("\n")}`;
    await countLlmCall(run.id);
    const result = await chat({
      messages, maxTokens: 4_500, temperature: 0.3, timeoutMs: 150_000, signal, onUsage: record(run.id),
      onText: (text) => { const objects = completeObjects(text); if (objects.length > seen) pending = pending.then(() => take(objects)); },
      // A reply with no test objects at all (a model that only "thinks") moves to the next model.
      accept: (text) => completeObjects(text).length > 0,
    }).catch((error) => {
      console.error("demo_generation_failed", { run_id: run.id, code: error instanceof Error ? error.message : "unknown" });
      if (isCapacityFailure(error)) {
        if (accepted.length === 0 || !queueEnabled()) throw error;
        capacity = error;
        return null;
      }
      if (accepted.length === 0) throw error;
      return null;
    });
    await pending;
    if (result) await take(completeObjects(result.text));
  }
  if (signal.aborted) return;
  if (accepted.length < 3) throw capacity ?? new Stop("generation_failed");
  await patchRun(run.id, { phase: "asking" });
}

/* ---------------------------------------------------------------- asking --- */

async function asking(run: RunRow, signal: AbortSignal) {
  if (run.target_kind === "website") return askWebsite(run, signal);
  const entry = state().secrets.get(run.id);
  const config = run.target_config as { model?: string; template?: unknown; slot?: Array<string | number>; response_path?: Array<string | number> | null; auth?: boolean };
  if (config.auth && !entry) throw new Stop("interrupted");
  let spec: Exclude<TargetSpec, { kind: "website" }> = run.target_kind === "openai_compatible"
    ? { kind: "openai_compatible", url: run.target_url, model: config.model ?? "" }
    : { kind: "https_json", url: run.target_url, template: config.template, slot: config.slot ?? [], responsePath: config.response_path ?? null };
  let consecutive = 0;
  for (const item of run.cases) {
    if (signal.aborted) return;
    if (run.answers[item.id]) continue;
    let answer = await demoIo.askApi(spec, entry?.secrets ?? {}, item.question, signal);
    // A rate-limited system gets two polite retries before the answer counts as missing.
    for (const wait of [5_000, 15_000]) {
      if (answer.error !== "target_rate_limited" || signal.aborted) break;
      await sleep(wait);
      answer = await demoIo.askApi(spec, entry?.secrets ?? {}, item.question, signal);
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
  if (signal.aborted) return;
  if (run.disclosure && !run.disclosure.transcript) await askApiDisclosure(run, spec, entry?.secrets ?? {}, signal);
  if (signal.aborted) return;
  await patchRun(run.id, { phase: "grading" });
}

/**
 * The AI-disclosure check for an API (launch L-29): the opening a visitor
 * would send, then the one ordinary question, each in a fresh conversation.
 * A failure is recorded in the transcript and never fails the run.
 */
async function askApiDisclosure(run: RunRow, spec: Exclude<TargetSpec, { kind: "website" }>, secrets: TargetSecrets, signal: AbortSignal) {
  const language = run.language ?? run.locale;
  try {
    const first = await demoIo.askApi(spec, secrets, OPENING_MESSAGE[language], signal);
    await sleep(1_000);
    const person = await demoIo.askApi(spec, secrets, PERSON_QUESTION[language], signal);
    await setDisclosureCapture(run.id, {
      requested: true,
      language,
      transcript: [
        disclosureTurn("opening", OPENING_MESSAGE[language]),
        disclosureTurn("first_reply", first.text, first.error),
        disclosureTurn("person_question", PERSON_QUESTION[language]),
        disclosureTurn("person_answer", person.text, person.error),
      ],
    });
  } catch (error) {
    console.warn("demo_disclosure_capture_failed", { run_id: run.id, error_type: error instanceof Error ? error.name : typeof error });
  }
}

async function askWebsite(run: RunRow, signal: AbortSignal) {
  const final = await waitFor(run.id, (row) => row.browser_chat === "done" || row.browser_chat === "failed" || row.cases.every((item) => row.answers[item.id]), 9 * 60_000, signal);
  if (signal.aborted) return;
  if (!final) throw new Stop("expired");
  const answered = final.cases.filter((item) => final.answers[item.id] && !final.answers[item.id].error).length;
  if (final.browser_chat === "failed" && answered === 0) throw new Stop(final.browser_error ?? "chat_not_found");
  for (const item of final.cases) if (!final.answers[item.id]) await setAnswer(run.id, item.id, { text: "", ms: 0, error: "timeout" });
  await patchRun(run.id, { phase: "grading" });
}

/* --------------------------------------------------------------- grading --- */

/** A run waiting this long for a grader is graded by word matching instead. */
const GRADING_PATIENCE_MS = 30 * 60_000;

async function grading(run: RunRow, signal: AbortSignal) {
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
        messages: judgeMessages(pending, locale), maxTokens: 3_500, temperature: 0, json: true, timeoutMs: 120_000, signal, onUsage: record(run.id),
        accept: (text) => parseJudgement(text).size * 2 >= pending.length,
      });
      judged = parseJudgement(result.text);
    } catch (error) {
      if (signal.aborted) return;
      // With the queue, a run waits for a grader rather than settle for word matching, within reason.
      const age = Date.now() - new Date(run.queued_at ?? run.created_at).getTime();
      if (isCapacityFailure(error) && queueEnabled() && age < GRADING_PATIENCE_MS) throw error;
      if (!(error instanceof QuotaError) && !(error instanceof ModelError) && !(error instanceof CapacityError)) throw error;
      console.error("demo_judge_failed", { run_id: run.id, code: error instanceof CapacityError ? error.code : error.message });
    }
    for (const { item, answer } of pending) verdicts[item.id] = judged.get(item.id) ?? lexicalVerdict(item, answer, locale);
  }
  if (signal.aborted) return;
  const disclosure = run.disclosure ? { ...run.disclosure, result: await classifyDisclosure(run, signal) } : undefined;
  if (signal.aborted) return;
  await ended(await finishRun(run.id, { verdicts, summary: summarize(run.cases, verdicts), disclosure, phase: "done" }));
}

/**
 * Classifies the AI-disclosure capture (launch L-29): patterns first, then one
 * small judge call when they cannot decide. It is kept apart from the verdicts
 * and the summary, so it never counts toward the score; a judge that cannot
 * answer leaves the result Unclear and never holds up the report.
 */
async function classifyDisclosure(run: RunRow, signal: AbortSignal): Promise<DisclosureResult> {
  const transcript = run.disclosure?.transcript ?? [];
  const language = run.disclosure?.language ?? run.language ?? run.locale;
  let judged: JudgeVerdict | null = null;
  if (needsDisclosureJudge(transcript)) {
    try {
      await countLlmCall(run.id);
      const result = await chat({
        messages: disclosureJudgeMessages(transcript), maxTokens: 400, temperature: 0, json: true, timeoutMs: 60_000, signal, onUsage: record(run.id),
        accept: (text) => parseDisclosureJudgement(text, transcript) !== null,
      });
      judged = parseDisclosureJudgement(result.text, transcript);
    } catch (error) {
      console.warn("demo_disclosure_judge_failed", { run_id: run.id, code: error instanceof CapacityError ? error.code : error instanceof Error ? error.name : "unknown" });
    }
  }
  return finalizeDisclosure({ transcript, language, judged });
}
