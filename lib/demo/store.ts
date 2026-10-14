import { sanitizeAttribution, type Attribution } from "@/lib/analytics/events";
import "server-only";
import { getPostgresPool } from "@/lib/db/client";
import type { DisclosureResult, DisclosureTurn } from "@/lib/evals/scoring/disclosure";
import type { DemoCase } from "./generate";
import type { DemoAnswer, DemoSummary, DemoVerdict } from "./judge";
import type { TargetSpec } from "./target";
import type { DemoPage } from "./web";

export type Phase = "reading" | "writing" | "asking" | "grading" | "done" | "failed";

/**
 * The AI-disclosure check (launch L-29) lives in `answers` under this key,
 * beside the case answers (`q1`…`q8`), so the browser worker can write its
 * capture with the grants it already has (no migration). `normalizeRun`
 * moves it to `disclosure`, so code that reads `answers` sees case answers only.
 */
export const DISCLOSURE_KEY = "ai_disclosure";
export type DemoDisclosure = {
  /** The check was on when the run started. */
  requested: true;
  /** The conversation captured for it (by the engine for APIs, the browser worker for websites). */
  transcript?: DisclosureTurn[];
  language?: "en" | "es";
  /** Classified when the run finishes; never part of the summary or the score. */
  result?: DisclosureResult;
};
export type BrowserState = "queued" | "running" | "done" | "failed" | null;

export type RunRow = {
  id: string;
  locale: "en" | "es";
  phase: Phase;
  error_code: string | null;
  target_kind: TargetSpec["kind"];
  target_url: string;
  target_host: string;
  target_config: Record<string, unknown>;
  docs_url: string;
  docs_host: string;
  language: "en" | "es" | null;
  pages: DemoPage[];
  cases: DemoCase[];
  answers: Record<string, DemoAnswer>;
  /** The AI-disclosure check, when requested (see DISCLOSURE_KEY). */
  disclosure: DemoDisclosure | null;
  verdicts: Record<string, DemoVerdict>;
  summary: DemoSummary | null;
  browser_docs: BrowserState;
  browser_chat: BrowserState;
  browser_pages: DemoPage[] | null;
  browser_error: string | null;
  attempts: number;
  llm_calls: number;
  version: number;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
  expires_at: Date;
  claimed_at: Date | null;
  /** When the run joined the queue; NULL only for rows written before migration 083. */
  queued_at: Date | null;
  /** When the run left the queue; NULL while it waits (again, after losing model capacity). */
  started_at: Date | null;
  notify_requested_at: Date | null;
  notified_at: Date | null;
  /** The encrypted address; never sent to the browser (lib/demo/view.ts). */
  notify_email_ciphertext: unknown;
  model_used: string | null;
  /** numeric(12,6), as text. */
  fallback_cost_eur: string;
  attribution?: Attribution;
};

/** A run counts as started once admitted, or when it predates the queue. */
export const STARTED = "(started_at IS NOT NULL OR queued_at IS NULL)";
/** Waiting in the queue. */
export const WAITING = "(started_at IS NULL AND queued_at IS NOT NULL)";

export function isWaiting(run: Pick<RunRow, "started_at" | "queued_at" | "phase">) {
  return run.started_at === null && run.queued_at !== null && run.phase !== "done" && run.phase !== "failed";
}

const db = () => getPostgresPool();

/** Every run read from the database passes here: the disclosure check leaves `answers`. */
export function normalizeRun<T extends RunRow | undefined>(row: T): T {
  if (!row) return row;
  const raw = (row.answers ?? {}) as Record<string, unknown>;
  const { [DISCLOSURE_KEY]: disclosure, ...answers } = raw;
  const value = disclosure && typeof disclosure === "object" && (disclosure as { requested?: unknown }).requested === true ? disclosure as DemoDisclosure : null;
  return { ...row, answers: answers as Record<string, DemoAnswer>, disclosure: value };
}

export async function insertRun(input: {
  tokenHash: string;
  locale: "en" | "es";
  spec: TargetSpec;
  targetHost: string;
  docsUrl: string;
  docsHost: string;
  clientHash: string;
  /** The target needs credentials that live only in this process. */
  auth: boolean;
  /** Join the queue instead of starting at once (DEMO_QUEUE_ENABLED). */
  queued?: boolean;
  attribution?: Attribution;
  /** Run the AI-disclosure check (AI_DISCLOSURE_CHECK when the run starts). */
  disclosure?: boolean;
}) {
  const { spec } = input;
  const config = {
    ...(spec.kind === "openai_compatible" ? { model: spec.model } : spec.kind === "https_json" ? { template: spec.template, slot: spec.slot, response_path: spec.responsePath } : {}),
    ...(input.auth ? { auth: true } : {}),
  };
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO demo.run (token_hash, locale, target_kind, target_url, target_host, target_config, docs_url, docs_host, client_hash, browser_chat, queued_at, started_at, attribution, answers)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10, now(), CASE WHEN $11::boolean THEN NULL ELSE now() END, $12::jsonb, $13::jsonb) RETURNING id`,
    [input.tokenHash, input.locale, spec.kind, spec.url, input.targetHost, JSON.stringify(config), input.docsUrl, input.docsHost, input.clientHash, spec.kind === "website" ? "queued" : null, Boolean(input.queued), JSON.stringify(sanitizeAttribution(input.attribution)),
      JSON.stringify(input.disclosure ? { [DISCLOSURE_KEY]: { requested: true } satisfies DemoDisclosure } : {})],
  );
  return rows[0].id;
}

export async function getRun(id: string, tokenHash?: string): Promise<RunRow | null> {
  const { rows } = await db().query<RunRow>(
    `SELECT * FROM demo.run WHERE id = $1 ${tokenHash ? "AND token_hash = $2" : ""} AND expires_at > now()`,
    tokenHash ? [id, tokenHash] : [id],
  );
  return normalizeRun(rows[0]) ?? null;
}

type Patch = Partial<Pick<RunRow, "phase" | "error_code" | "language" | "summary" | "browser_docs" | "browser_chat" | "target_config">> & {
  pages?: DemoPage[];
  verdicts?: Record<string, DemoVerdict>;
  /** The AI-disclosure check's stored state (its result, when the run finishes). */
  disclosure?: DemoDisclosure;
  finished?: boolean;
};

/**
 * Updates a run that is still in progress. A finished run is never changed
 * again, so work that outlived its phase deadline cannot overwrite the result.
 */
export async function patchRun(id: string, patch: Patch) {
  await update(id, patch, false);
}

/** Ends a run (done or failed) and returns it, or null when it had already ended. */
export async function finishRun(id: string, patch: Omit<Patch, "finished"> & { phase: "done" | "failed" }): Promise<RunRow | null> {
  return update(id, { ...patch, finished: true }, true);
}

async function update(id: string, patch: Patch, returning: boolean): Promise<RunRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [id];
  const add = (column: string, value: unknown, cast = "") => { values.push(value); sets.push(`${column} = $${values.length}${cast}`); };
  if (patch.phase) add("phase", patch.phase);
  if (patch.error_code !== undefined) add("error_code", patch.error_code);
  if (patch.language !== undefined) add("language", patch.language);
  if (patch.summary !== undefined) add("summary", JSON.stringify(patch.summary), "::jsonb");
  if (patch.browser_docs !== undefined) add("browser_docs", patch.browser_docs);
  if (patch.browser_chat !== undefined) add("browser_chat", patch.browser_chat);
  if (patch.target_config !== undefined) add("target_config", JSON.stringify(patch.target_config), "::jsonb");
  if (patch.pages !== undefined) add("pages", JSON.stringify(patch.pages), "::jsonb");
  if (patch.verdicts !== undefined) add("verdicts", JSON.stringify(patch.verdicts), "::jsonb");
  if (patch.disclosure !== undefined) {
    values.push(JSON.stringify(patch.disclosure));
    sets.push(`answers = answers || jsonb_build_object('${DISCLOSURE_KEY}', $${values.length}::jsonb)`);
  }
  if (patch.finished) sets.push("finished_at = now()", "lease_owner = NULL", "lease_until = NULL");
  if (!sets.length) return null;
  const { rows } = await db().query<RunRow>(
    `UPDATE demo.run SET ${sets.join(", ")}, version = version + 1, updated_at = now() WHERE id = $1 AND phase NOT IN ('done','failed') ${returning ? "RETURNING *" : ""}`,
    values,
  );
  return normalizeRun(rows[0]) ?? null;
}

/**
 * Sends a started run back to the queue (no model can serve it now). It keeps
 * its original queued_at, so it is first in line again, and its work so far.
 * Its claim does not count as an attempt.
 */
export async function requeueRun(id: string) {
  const { rowCount } = await db().query(
    `UPDATE demo.run SET started_at = NULL, lease_owner = NULL, lease_until = NULL, attempts = greatest(attempts - 1, 0),
       queued_at = coalesce(queued_at, created_at), version = version + 1, updated_at = now()
     WHERE id = $1 AND phase NOT IN ('done','failed')`,
    [id],
  );
  return rowCount === 1;
}

/** Records the model that answered and adds what a fallback call cost. */
export async function recordModelUse(id: string, use: { model: string; costEur: number; ok: boolean }) {
  const model = use.model.replace(/[^A-Za-z0-9._:/@+-]/g, "").slice(0, 120) || "unknown";
  await db().query(
    `UPDATE demo.run SET
       model_used = CASE WHEN NOT $4::boolean THEN model_used
         WHEN model_used IS NULL THEN $2
         WHEN $2 = ANY(string_to_array(model_used, ',')) THEN model_used
         WHEN length(model_used) + length($2) < 400 THEN model_used || ',' || $2
         ELSE model_used END,
       fallback_cost_eur = fallback_cost_eur + $3::numeric
     WHERE id = $1`,
    [id, model, Math.max(0, use.costEur).toFixed(6), use.ok],
  );
}

/** Adds one question, stamped with the database time it was written (`at`: time to first question, launch L-24). */
export async function appendCase(id: string, item: DemoCase) {
  await db().query("UPDATE demo.run SET cases = cases || jsonb_build_array($2::jsonb || jsonb_build_object('at', now())), version = version + 1, updated_at = now() WHERE id = $1 AND phase NOT IN ('done','failed')", [id, JSON.stringify(item)]);
}

export async function setAnswer(id: string, caseId: string, answer: DemoAnswer) {
  await db().query(
    "UPDATE demo.run SET answers = answers || jsonb_build_object($2::text, $3::jsonb), version = version + 1, updated_at = now() WHERE id = $1 AND phase NOT IN ('done','failed')",
    [id, caseId, JSON.stringify(answer)],
  );
}

/** The conversation captured for the AI-disclosure check, while the run still asks. */
export async function setDisclosureCapture(id: string, capture: DemoDisclosure) {
  await db().query(
    `UPDATE demo.run SET answers = answers || jsonb_build_object('${DISCLOSURE_KEY}', $2::jsonb), version = version + 1, updated_at = now()
     WHERE id = $1 AND phase IN ('reading','writing','asking')`,
    [id, JSON.stringify(capture)],
  );
}

export async function countLlmCall(id: string) {
  await db().query("UPDATE demo.run SET llm_calls = llm_calls + 1 WHERE id = $1", [id]);
}

/** Takes the oldest started, unfinished run whose lease lapsed. Waiting runs stay in the queue. */
export async function claimRun(owner: string, exclude: string[]): Promise<RunRow | null> {
  const { rows } = await db().query<RunRow>(
    `UPDATE demo.run SET lease_owner = $1, lease_until = now() + interval '45 seconds', attempts = attempts + 1
     WHERE id = (SELECT id FROM demo.run WHERE phase NOT IN ('done','failed') AND ${STARTED} AND (lease_until IS NULL OR lease_until < now())
       AND NOT (id = ANY($2::uuid[])) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [owner, exclude],
  );
  return normalizeRun(rows[0]) ?? null;
}

export async function renewLease(id: string, owner: string) {
  const { rowCount } = await db().query("UPDATE demo.run SET lease_until = now() + interval '45 seconds' WHERE id = $1 AND lease_owner = $2 AND phase NOT IN ('done','failed')", [id, owner]);
  return rowCount === 1;
}

/**
 * Housekeeping: expired runs and spent challenges are deleted; abandoned runs
 * fail as `interrupted`, and runs that waited too long as `queue_timeout`.
 * Returns the runs it ended, for their events and report emails.
 */
export async function sweep(options: { runLimitMs: number; queueMaxWaitMs: number }): Promise<RunRow[]> {
  await db().query("DELETE FROM demo.run WHERE expires_at < now()");
  await db().query("DELETE FROM demo.challenge_use WHERE used_at < now() - interval '1 hour'");
  await db().query("DELETE FROM demo.llm_usage WHERE day < (now() AT TIME ZONE 'utc')::date - 30");
  const { rows } = await db().query<RunRow>(
    `UPDATE demo.run SET phase = 'failed',
       error_code = CASE WHEN ${STARTED} THEN 'interrupted' ELSE 'queue_timeout' END,
       finished_at = now(), lease_owner = NULL, lease_until = NULL, version = version + 1, updated_at = now()
     WHERE phase NOT IN ('done','failed') AND (
       (${STARTED} AND (coalesce(started_at, created_at) < now() - make_interval(secs => $1) OR attempts > 4))
       OR (${WAITING} AND queued_at < now() - make_interval(secs => $2)))
     RETURNING *`,
    [options.runLimitMs / 1000, options.queueMaxWaitMs / 1000],
  );
  return rows.map((row) => normalizeRun(row));
}

export async function spendChallenge(digest: string) {
  const { rowCount } = await db().query("INSERT INTO demo.challenge_use (digest) VALUES ($1) ON CONFLICT DO NOTHING", [digest]);
  return rowCount === 1;
}

export type Usage = { clientRuns: number; clientAttempts: number; targetRuns: number; docsRuns: number; active: number; queued: number; startedToday: number };

/**
 * Counts for the limits. A failed run does not use up the visitor's demo
 * (a site we could not read, a chat we could not find); attempts of any
 * outcome are capped separately.
 */
export async function usage(clientHash: string, targetHost: string, docsHost: string): Promise<Usage> {
  const { rows } = await db().query<Record<keyof Usage, string>>(
    `SELECT
       count(*) FILTER (WHERE client_hash = $1 AND phase <> 'failed' AND created_at > now() - interval '24 hours') AS "clientRuns",
       count(*) FILTER (WHERE client_hash = $1 AND created_at > now() - interval '24 hours') AS "clientAttempts",
       count(*) FILTER (WHERE target_host = $2 AND phase <> 'failed' AND created_at > now() - interval '24 hours') AS "targetRuns",
       count(*) FILTER (WHERE docs_host = $3 AND phase <> 'failed' AND created_at > now() - interval '24 hours') AS "docsRuns",
       count(*) FILTER (WHERE phase NOT IN ('done','failed') AND ${STARTED}) AS active,
       count(*) FILTER (WHERE phase NOT IN ('done','failed') AND ${WAITING}) AS queued,
       count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc') AS "startedToday"
     FROM demo.run WHERE created_at > now() - interval '48 hours'`,
    [clientHash, targetHost, docsHost],
  );
  const row = rows[0];
  return { clientRuns: +row.clientRuns, clientAttempts: +row.clientAttempts, targetRuns: +row.targetRuns, docsRuns: +row.docsRuns, active: +row.active, queued: +row.queued, startedToday: +row.startedToday };
}

export async function markClaimed(id: string) {
  await db().query("UPDATE demo.run SET claimed_at = now(), expires_at = greatest(expires_at, now() + interval '2 days') WHERE id = $1", [id]);
}
