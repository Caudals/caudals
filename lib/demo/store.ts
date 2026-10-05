import "server-only";
import { getPostgresPool } from "@/lib/db/client";
import type { DemoCase } from "./generate";
import type { DemoAnswer, DemoSummary, DemoVerdict } from "./judge";
import type { TargetSpec } from "./target";
import type { DemoPage } from "./web";

export type Phase = "reading" | "writing" | "asking" | "grading" | "done" | "failed";
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
};

const db = () => getPostgresPool();

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
}) {
  const { spec } = input;
  const config = {
    ...(spec.kind === "openai_compatible" ? { model: spec.model } : spec.kind === "https_json" ? { template: spec.template, slot: spec.slot, response_path: spec.responsePath } : {}),
    ...(input.auth ? { auth: true } : {}),
  };
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO demo.run (token_hash, locale, target_kind, target_url, target_host, target_config, docs_url, docs_host, client_hash, browser_chat)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING id`,
    [input.tokenHash, input.locale, spec.kind, spec.url, input.targetHost, JSON.stringify(config), input.docsUrl, input.docsHost, input.clientHash, spec.kind === "website" ? "queued" : null],
  );
  return rows[0].id;
}

export async function getRun(id: string, tokenHash?: string): Promise<RunRow | null> {
  const { rows } = await db().query<RunRow>(
    `SELECT * FROM demo.run WHERE id = $1 ${tokenHash ? "AND token_hash = $2" : ""} AND expires_at > now()`,
    tokenHash ? [id, tokenHash] : [id],
  );
  return rows[0] ?? null;
}

type Patch = Partial<Pick<RunRow, "phase" | "error_code" | "language" | "summary" | "browser_docs" | "browser_chat" | "target_config">> & {
  pages?: DemoPage[];
  verdicts?: Record<string, DemoVerdict>;
  finished?: boolean;
};

export async function patchRun(id: string, patch: Patch) {
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
  if (patch.finished) sets.push("finished_at = now()", "lease_owner = NULL", "lease_until = NULL");
  if (!sets.length) return;
  await db().query(`UPDATE demo.run SET ${sets.join(", ")}, version = version + 1, updated_at = now() WHERE id = $1`, values);
}

export async function appendCase(id: string, item: DemoCase) {
  await db().query("UPDATE demo.run SET cases = cases || $2::jsonb, version = version + 1, updated_at = now() WHERE id = $1", [id, JSON.stringify([item])]);
}

export async function setAnswer(id: string, caseId: string, answer: DemoAnswer) {
  await db().query(
    "UPDATE demo.run SET answers = answers || jsonb_build_object($2::text, $3::jsonb), version = version + 1, updated_at = now() WHERE id = $1",
    [id, caseId, JSON.stringify(answer)],
  );
}

export async function countLlmCall(id: string) {
  await db().query("UPDATE demo.run SET llm_calls = llm_calls + 1 WHERE id = $1", [id]);
}

/** Takes the oldest unfinished run whose lease lapsed. */
export async function claimRun(owner: string, exclude: string[]): Promise<RunRow | null> {
  const { rows } = await db().query<RunRow>(
    `UPDATE demo.run SET lease_owner = $1, lease_until = now() + interval '45 seconds', attempts = attempts + 1
     WHERE id = (SELECT id FROM demo.run WHERE phase NOT IN ('done','failed') AND (lease_until IS NULL OR lease_until < now())
       AND NOT (id = ANY($2::uuid[])) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [owner, exclude],
  );
  return rows[0] ?? null;
}

export async function renewLease(id: string, owner: string) {
  const { rowCount } = await db().query("UPDATE demo.run SET lease_until = now() + interval '45 seconds' WHERE id = $1 AND lease_owner = $2 AND phase NOT IN ('done','failed')", [id, owner]);
  return rowCount === 1;
}

/** Housekeeping: expired runs and spent challenges are deleted; abandoned runs fail. */
export async function sweep() {
  await db().query("DELETE FROM demo.run WHERE expires_at < now()");
  await db().query("DELETE FROM demo.challenge_use WHERE used_at < now() - interval '1 hour'");
  await db().query("DELETE FROM demo.llm_usage WHERE day < (now() AT TIME ZONE 'utc')::date - 30");
  await db().query(`UPDATE demo.run SET phase = 'failed', error_code = 'interrupted', finished_at = now(), version = version + 1, updated_at = now()
    WHERE phase NOT IN ('done','failed') AND (created_at < now() - interval '25 minutes' OR attempts > 4)`);
}

export async function spendChallenge(digest: string) {
  const { rowCount } = await db().query("INSERT INTO demo.challenge_use (digest) VALUES ($1) ON CONFLICT DO NOTHING", [digest]);
  return rowCount === 1;
}

export type Usage = { clientRuns: number; clientAttempts: number; targetRuns: number; docsRuns: number; active: number; startedToday: number };

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
       count(*) FILTER (WHERE phase NOT IN ('done','failed')) AS active,
       count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc') AS "startedToday"
     FROM demo.run WHERE created_at > now() - interval '48 hours'`,
    [clientHash, targetHost, docsHost],
  );
  const row = rows[0];
  return { clientRuns: +row.clientRuns, clientAttempts: +row.clientAttempts, targetRuns: +row.targetRuns, docsRuns: +row.docsRuns, active: +row.active, startedToday: +row.startedToday };
}

export async function markClaimed(id: string) {
  await db().query("UPDATE demo.run SET claimed_at = now(), expires_at = greatest(expires_at, now() + interval '2 days') WHERE id = $1", [id]);
}
