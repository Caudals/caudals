import "server-only";
import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";
import { withTenant } from "./db";
import { onboardingEnabled } from "../onboarding/flags";
import type { EvidenceScope } from "./evidence";
import { MAX_GENERATED_CASES, startAutomaticGenerationInTransaction } from "./automatic-generation";
import {
  AUTOMATIC_PROMPT_REVISION, CHECKLIST_STEPS, ONBOARDING_DEFAULT_CASES, ONBOARDING_PAGE_CAP,
  type AutostartStatus, type ConnectionState, type FirstEvaluation, type Goal, type SiteState, type SystemType, type WorkspaceOnboarding,
} from "../onboarding/config";

/**
 * First-run onboarding and activation (launch L-06, spec v2 P-01, P-02,
 * P-04; migration 086).
 *
 * - **Automatic start.** Signing up with a finished demo imports it
 *   (lib/demo/import.ts), which queues the connection check and the reading
 *   of the demo's site (capped pages, no model calls). The sign-up also
 *   records an intent in evals.onboarding_autostart. The intent is advanced by
 *   the scheduler's short tick, by the evaluation page while it is open and
 *   once right after sign-up: as soon as the site is read and the connection
 *   check has passed (or needs only an operator's help with the chat), it
 *   starts automatic generation up to the plan's test limit. Nothing that
 *   spends DGX time starts while the chat is unreachable or the site could not
 *   be read; the page shows the demo's recovery guidance and "Get help".
 * - **Exactly one job.** The intent row is locked for update, the start runs
 *   inside a savepoint with a fixed idempotency key, and a job that already
 *   exists for the evaluation (someone pressed Generate) supersedes the intent.
 * - **Checklist and welcome** live in evals.workspace_onboarding, written only
 *   through SECURITY DEFINER functions that check the caller's role in SQL.
 *
 * Everything is off unless ONBOARDING_AUTOSTART=true (web and scheduler).
 */

export { onboardingEnabled };

/** How long a connection check may stay queued before the start goes ahead on the read site alone. */
const CHECK_WAIT_MS = 5 * 60_000;
/** An intent nobody could satisfy in two days stops being retried. */
const INTENT_TTL_MS = 2 * 24 * 3600_000;
/** Codes that mean the chat or API could not be reached at all (not an automation problem). */
const UNREACHABLE = new Set(["destination_denied", "destination_invalid", "connection_unsupported", "connection_check_failed"]);
const READING = new Set(["queued", "running", "captured", "persisting", "extracting"]);

/** The SQL functions raise plain codes; the API answers them as domain errors. */
function domainError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === "SCOPE_DENIED" || message === "SESSION_REQUIRED") throw new EvalError("SCOPE_DENIED", 403);
  if (message === "INPUT_INVALID") throw new EvalError("INPUT_INVALID", 422, "Check the supplied fields.");
  throw error;
}

type SourceRow = { id: string; website_status: string | null; website_reason: string | null; start_url: string | null; revision_id: string | null; ingestion_status: string | null; ingestion_reason: string | null };
type ConnectionRow = { kind: string | null; endpoint: string | null; status: string | null; error_code: string | null; created_at: Date | null };
type Intent = { org_id: string; evaluation_id: string; status: AutostartStatus; reason_code: string | null; locale: "en" | "es"; page_limit: number; max_cases: number | null; generation_job_id: string | null; created_by: string; created_at: Date; started_at: Date | null };

export type AutostartFacts = {
  evaluation: { archived: boolean; title: string; suiteSelected: boolean; jobs: number; cap: number | null } | null;
  sources: SourceRow[];
  connection: ConnectionRow | null;
  createdAt: Date;
};

const host = (url: string | null) => {
  if (!url) return null;
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return null; }
};

/** The site step: ready when every source has finished and one has text; failed when none could be read. */
export function siteState(sources: SourceRow[]): { state: SiteState; code: string | null; host: string | null; revisions: string[] } {
  const website = sources.find((row) => row.start_url) ?? null;
  const base = { host: host(website?.start_url ?? null) };
  if (!sources.length) return { state: "none", code: null, ...base, revisions: [] };
  const ready = sources.filter((row) => row.revision_id && (row.website_status === null || row.website_status === "completed"));
  const reading = sources.filter((row) => !ready.includes(row) && (row.website_status ? READING.has(row.website_status) : ["queued", "running"].includes(row.ingestion_status ?? "")));
  const failed = sources.filter((row) => !ready.includes(row) && !reading.includes(row) && (row.website_status === "failed" || row.ingestion_status === "failed"));
  if (reading.length) return { state: "reading", code: null, ...base, revisions: [] };
  if (ready.length) return { state: "ready", code: null, ...base, revisions: ready.map((row) => row.revision_id!).slice(0, 21) };
  if (failed.length) return { state: "failed", code: failed[0].website_reason ?? failed[0].ingestion_reason ?? null, ...base, revisions: [] };
  return { state: "reading", code: null, ...base, revisions: [] };
}

/** The connection step from the latest check of the evaluation's system. */
export function connectionState(row: ConnectionRow | null): { state: ConnectionState; code: string | null; kind: string | null; host: string | null } {
  const base = { kind: row?.kind ?? null, host: host(row?.endpoint ?? null) };
  if (!row?.kind) return { state: "none", code: null, ...base };
  if (!row.status) return { state: "unchecked", code: null, ...base };
  if (row.status === "ready") return { state: "ready", code: null, ...base };
  if (row.status === "queued" || row.status === "running") return { state: "checking", code: null, ...base };
  if (row.status === "failed" || UNREACHABLE.has(row.error_code ?? "")) return { state: "unreachable", code: row.error_code ?? "connection_check_failed", ...base };
  return { state: "attention", code: row.error_code, ...base };
}

export type AutostartDecision =
  | { status: "start"; revisions: string[]; maxCases: number }
  | { status: Exclude<AutostartStatus, "started">; reason: string | null };

/**
 * What the intent does now. Pure, so the rules are unit-tested: wait while
 * the site is read or the check runs; block (and keep re-checking) while the
 * chat is unreachable or no reference text exists; start otherwise.
 */
export function decideAutostart(facts: AutostartFacts, now = Date.now()): AutostartDecision {
  const evaluation = facts.evaluation;
  if (!evaluation || evaluation.archived) return { status: "canceled", reason: "evaluation_removed" };
  if (evaluation.jobs > 0 || evaluation.suiteSelected) return { status: "superseded", reason: "manual_start" };
  if (now - facts.createdAt.getTime() > INTENT_TTL_MS) return { status: "expired", reason: "autostart_timeout" };
  const connection = connectionState(facts.connection);
  const site = siteState(facts.sources);
  if (connection.state === "unreachable") return { status: "blocked", reason: "chat_unreachable" };
  if (site.state === "none") return { status: "blocked", reason: "no_reference_pages" };
  if (site.state === "failed") return { status: "blocked", reason: "site_unreadable" };
  if (site.state === "reading") return { status: "waiting", reason: "reading_site" };
  const checkAge = facts.connection?.created_at ? now - facts.connection.created_at.getTime() : 0;
  if (connection.state === "checking" && checkAge < CHECK_WAIT_MS) return { status: "waiting", reason: "checking_connection" };
  const maxCases = Math.max(1, Math.min(MAX_GENERATED_CASES, evaluation.cap ?? ONBOARDING_DEFAULT_CASES));
  return { status: "start", revisions: site.revisions, maxCases };
}

async function loadFacts(db: PoolClient, orgId: string, evaluationId: string, createdAt: Date): Promise<AutostartFacts> {
  const evaluation = (await db.query(`SELECT e.title,e.archived_at IS NOT NULL AS archived,e.selected_suite_version_id IS NOT NULL AS suite_selected,e.project_id,
      (SELECT count(*)::int FROM evals.generation_job g WHERE g.org_id=e.org_id AND g.evaluation_id=e.id) AS jobs,
      (SELECT max_tests_per_set FROM evals.workspace_entitlement x WHERE x.org_id=e.org_id) AS cap
    FROM evals.evaluation e WHERE e.org_id=$1 AND e.id=$2`, [orgId, evaluationId])).rows[0];
  const sources = (await db.query(`SELECT s.id,w.status AS website_status,w.reason_code AS website_reason,w.start_url,
      (SELECT sr.id FROM evals.source_revision sr JOIN evals.artifact a ON (a.org_id,a.id)=(sr.org_id,sr.artifact_id)
        WHERE sr.org_id=s.org_id AND sr.source_id=s.id AND a.state='ready' AND a.expires_at>now() ORDER BY sr.created_at DESC,sr.id DESC LIMIT 1) AS revision_id,
      (SELECT j.status FROM evals.source_ingestion_job j WHERE j.org_id=s.org_id AND j.source_id=s.id ORDER BY j.created_at DESC,j.id DESC LIMIT 1) AS ingestion_status,
      (SELECT j.reason_code FROM evals.source_ingestion_job j WHERE j.org_id=s.org_id AND j.source_id=s.id ORDER BY j.created_at DESC,j.id DESC LIMIT 1) AS ingestion_reason
    FROM evals.source s LEFT JOIN evals.website_source_job w ON (w.org_id,w.source_id)=(s.org_id,s.id)
    WHERE s.org_id=$1 AND s.evaluation_id=$2 AND s.archived_at IS NULL ORDER BY s.created_at,s.id LIMIT 25`, [orgId, evaluationId])).rows as SourceRow[];
  const connection = evaluation ? ((await db.query(`SELECT tr.document->>'kind' AS kind,tr.document->>'endpoint' AS endpoint,c.status,c.error_code,c.created_at
    FROM evals.target t
    JOIN LATERAL (SELECT x.id,x.document FROM evals.target_revision x WHERE x.org_id=t.org_id AND x.target_id=t.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) tr ON true
    LEFT JOIN LATERAL (SELECT x.status,x.error_code,x.created_at FROM evals.connection_check x WHERE x.org_id=t.org_id AND x.target_revision_id=tr.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) c ON true
    WHERE t.org_id=$1 AND t.project_id=$2 AND t.archived_at IS NULL ORDER BY t.created_at DESC,t.id LIMIT 1`, [orgId, evaluation.project_id])).rows[0] as ConnectionRow | undefined) ?? null : null;
  return {
    evaluation: evaluation ? { archived: evaluation.archived, title: evaluation.title, suiteSelected: evaluation.suite_selected, jobs: evaluation.jobs, cap: evaluation.cap } : null,
    sources, connection, createdAt,
  };
}

/** Records the intent for an imported demo's evaluation. Idempotent: one intent per evaluation. */
export function queueOnboardingAutostart(scope: EvidenceScope, evaluationId: string, input: { demoRunId: string | null; locale: "en" | "es"; pageLimit?: number }) {
  return withTenant(scope, async (db) => (await db.query(`INSERT INTO evals.onboarding_autostart(org_id,evaluation_id,demo_run_id,locale,page_limit,created_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (org_id,evaluation_id) DO NOTHING RETURNING status`,
    [scope.orgId, evaluationId, input.demoRunId, input.locale, Math.min(ONBOARDING_PAGE_CAP, Math.max(1, input.pageLimit ?? ONBOARDING_PAGE_CAP)), scope.actorId])).rowCount === 1);
}

/** Decides one pending intent under its row lock. Returns its new status, or null when it was not pending. */
async function advanceOne(scope: EvidenceScope, evaluationId: string): Promise<AutostartStatus | null> {
  return withTenant(scope, async (db) => {
    const intent = (await db.query("SELECT * FROM evals.onboarding_autostart WHERE org_id=$1 AND evaluation_id=$2 FOR UPDATE", [scope.orgId, evaluationId])).rows[0] as Intent | undefined;
    // Already decided by another caller (or earlier): nothing to do, and nothing started now.
    if (!intent || (intent.status !== "waiting" && intent.status !== "blocked")) return null;
    const save = async (status: AutostartStatus, reason: string | null, extra: { jobId?: string; maxCases?: number } = {}) => {
      if (status === intent.status && reason === intent.reason_code && !extra.jobId) return status;
      await db.query(`UPDATE evals.onboarding_autostart SET status=$3,reason_code=$4,generation_job_id=COALESCE($5,generation_job_id),max_cases=COALESCE($6,max_cases),
        started_at=CASE WHEN $3='started' THEN now() ELSE started_at END,updated_at=now() WHERE org_id=$1 AND evaluation_id=$2`,
        [scope.orgId, evaluationId, status, reason, extra.jobId ?? null, extra.maxCases ?? null]);
      return status;
    };
    const facts = await loadFacts(db, scope.orgId, evaluationId, new Date(intent.created_at));
    const decision = decideAutostart(facts);
    if (decision.status !== "start") return save(decision.status, decision.reason);

    // New work starts on behalf of the person who signed up, after rechecking their access (as restarts do).
    const actor = { orgId: scope.orgId, actorId: intent.created_by };
    await db.query("SELECT set_config('evals.actor_id',$1,true)", [actor.actorId]);
    const writer = (await db.query("SELECT 1 FROM evals.membership WHERE org_id=$1 AND user_id=$2 AND role IN ('owner','operator','editor')", [scope.orgId, actor.actorId])).rowCount;
    if (!writer) return save("canceled", "requester_lost_access");
    const input = {
      sourceRevisionIds: decision.revisions, title: `${facts.evaluation!.title} test set`.slice(0, 200), executionMode: "deployed_system" as const,
      promptRevision: AUTOMATIC_PROMPT_REVISION, maxCases: decision.maxCases, complexity: "balanced" as const, locale: intent.locale,
    };
    // A refusal must not leave half a job behind: everything the start wrote is rolled back.
    await db.query("SAVEPOINT onboarding_autostart");
    try {
      const started = await startAutomaticGenerationInTransaction(db, actor, evaluationId, input, `onboarding-autostart-${evaluationId}`);
      await db.query("RELEASE SAVEPOINT onboarding_autostart");
      await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'evaluation.autostart',$3,$4)",
        [scope.orgId, actor.actorId, evaluationId, { generationJobId: started.jobId, maxCases: decision.maxCases, sources: decision.revisions.length }]);
      return save("started", null, { jobId: started.jobId, maxCases: decision.maxCases });
    } catch (error) {
      await db.query("ROLLBACK TO SAVEPOINT onboarding_autostart");
      await db.query("RELEASE SAVEPOINT onboarding_autostart");
      if (!(error instanceof EvalError)) throw error;
      // Someone started preparation by hand in the meantime: theirs is the one job.
      if (error.code === "VERSION_CONFLICT") return save("superseded", "manual_start");
      return save("blocked", error.code === "PROVIDER_UNAVAILABLE" ? "generation_unavailable" : error.code === "BUDGET_UNAVAILABLE" ? "budget_unavailable" : "generation_refused");
    }
  });
}

/**
 * Advances pending intents of one workspace (or one evaluation). Safe to call
 * from several places at once: the row lock lets one caller decide, and a
 * started intent is never started again. Returns how many started now.
 */
export async function advanceOnboardingAutostarts(scope: EvidenceScope, evaluationId?: string) {
  if (!onboardingEnabled()) return 0;
  const due = await withTenant(scope, async (db) => (await db.query(`SELECT evaluation_id FROM evals.onboarding_autostart
    WHERE org_id=$1 AND status IN ('waiting','blocked') AND ($2::uuid IS NULL OR evaluation_id=$2) ORDER BY created_at LIMIT 10`,
    [scope.orgId, evaluationId ?? null])).rows as Array<{ evaluation_id: string }>);
  let started = 0;
  for (const row of due) {
    try {
      if ((await advanceOne(scope, row.evaluation_id)) === "started") started++;
    } catch (error) {
      // One evaluation's failure must not stop the others; the next tick retries.
      console.error(JSON.stringify({ event: "onboarding_autostart_failed", orgId: scope.orgId, reason: error instanceof Error && /^[a-z0-9_]{1,80}$/i.test(error.message) ? error.message : error instanceof Error ? error.name : "unknown" }));
      if (evaluationId) throw error;
    }
  }
  return started;
}

/** Workspaces with pending intents (live ones, platform-wide), for the scheduler's short tick. */
export async function onboardingDueWorkspaces(actorId: string): Promise<string[]> {
  if (!onboardingEnabled()) return [];
  return withTenant({ orgId: "", actorId }, async (db) => (await db.query("SELECT evals.onboarding_autostart_due() AS id")).rows.map((row) => row.id as string));
}

/** The evaluation page's "first evaluation" checklist; advances the intent first. */
export async function getFirstEvaluation(scope: EvidenceScope, evaluationId: string): Promise<FirstEvaluation> {
  const enabled = onboardingEnabled();
  const empty: FirstEvaluation = { enabled, autostart: null, connection: { state: "none", code: null, kind: null, host: null }, site: { state: "none", code: null, host: null }, generation: null, help: null };
  if (!enabled) return empty;
  try {
    await advanceOnboardingAutostarts(scope, evaluationId);
  } catch {
    // The state below still shows where it stands; the scheduler retries.
  }
  return withTenant(scope, async (db) => {
    const exists = (await db.query("SELECT 1 FROM evals.evaluation WHERE org_id=$1 AND id=$2", [scope.orgId, evaluationId])).rowCount;
    if (!exists) throw new EvalError("SCOPE_DENIED", 404);
    const intent = (await db.query("SELECT * FROM evals.onboarding_autostart WHERE org_id=$1 AND evaluation_id=$2", [scope.orgId, evaluationId])).rows[0] as Intent | undefined;
    if (!intent) return empty;
    const facts = await loadFacts(db, scope.orgId, evaluationId, new Date(intent.created_at));
    const site = siteState(facts.sources);
    const job = (await db.query(`SELECT status,control_state,reason_code,requested_case_count,jsonb_array_length(draft_cases)::int AS written
      FROM evals.generation_job WHERE org_id=$1 AND evaluation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`, [scope.orgId, evaluationId])).rows[0];
    const help = (await db.query(`SELECT id,status,created_at FROM evals.onboarding_help_request WHERE org_id=$1 AND evaluation_id=$2
      ORDER BY (status='open') DESC,created_at DESC LIMIT 1`, [scope.orgId, evaluationId])).rows[0];
    return {
      enabled,
      autostart: { status: intent.status, reasonCode: intent.reason_code, pageLimit: intent.page_limit, maxCases: intent.max_cases ?? Math.min(MAX_GENERATED_CASES, facts.evaluation?.cap ?? ONBOARDING_DEFAULT_CASES), createdAt: new Date(intent.created_at).toISOString(), startedAt: intent.started_at ? new Date(intent.started_at).toISOString() : null, generationJobId: intent.generation_job_id },
      connection: connectionState(facts.connection),
      site: { state: site.state, code: site.code, host: site.host },
      generation: job ? { status: job.control_state !== "active" ? job.control_state : job.status, written: job.written ?? 0, target: job.requested_case_count, reasonCode: job.reason_code } : null,
      help: help ? { id: help.id, status: help.status, createdAt: new Date(help.created_at).toISOString() } : null,
    };
  });
}

/** Why a person asks for help, from the evaluation's own state (never free text). */
export function helpReason(state: FirstEvaluation) {
  if (state.connection.state === "unreachable") return "chat_unreachable";
  if (state.site.state === "failed") return "site_unreadable";
  if (state.site.state === "none") return "no_reference_pages";
  if (state.connection.state === "attention") return state.connection.code === "browser_session_unavailable" ? "chat_login_required" : "chat_needs_setup";
  if (state.autostart?.status === "blocked") return state.autostart.reasonCode ?? "autostart_blocked";
  if (state.generation && ["quarantined", "failed", "paused", "stopped"].includes(state.generation.status)) return "generation_stopped";
  return "first_evaluation";
}

/** Opens (or returns the open) help request for an evaluation. */
export function requestOnboardingHelp(scope: EvidenceScope, evaluationId: string, reason: string) {
  return withTenant(scope, async (db) => {
    const row = (await db.query("SELECT * FROM evals.request_onboarding_help($1,$2,$3)", [scope.orgId, evaluationId, reason])).rows[0] as { id: string; created: boolean; notified: boolean };
    const context = (await db.query("SELECT w.name AS workspace,e.title AS evaluation FROM evals.workspace w JOIN evals.evaluation e ON e.org_id=w.id WHERE w.id=$1 AND e.id=$2", [scope.orgId, evaluationId])).rows[0] as { workspace: string; evaluation: string } | undefined;
    return { ...row, workspace: context?.workspace ?? "", evaluation: context?.evaluation ?? "" };
  }).catch(domainError);
}

export function markOnboardingHelpNotified(scope: EvidenceScope, requestId: string) {
  return withTenant(scope, (db) => db.query("SELECT evals.mark_onboarding_help_notified($1,$2)", [scope.orgId, requestId]));
}

/** An operator closes a help request. */
export function resolveOnboardingHelp(actorId: string, requestId: string) {
  return withTenant({ orgId: "", actorId }, async (db) => Boolean((await db.query("SELECT evals.resolve_onboarding_help($1) AS done", [requestId])).rows[0]?.done)).catch(domainError);
}

/** Called in the sign-up transaction by the new owner (see app/api/evals/v1/signup/route.ts). */
export async function startWorkspaceOnboarding(db: PoolClient, orgId: string) {
  if (!onboardingEnabled()) return;
  // The account matters more than its checklist: a failure here never undoes the sign-up.
  await db.query("SAVEPOINT onboarding_start");
  try {
    await db.query("SELECT evals.start_workspace_onboarding($1)", [orgId]);
    await db.query("RELEASE SAVEPOINT onboarding_start");
  } catch {
    await db.query("ROLLBACK TO SAVEPOINT onboarding_start");
    await db.query("RELEASE SAVEPOINT onboarding_start");
    console.error(JSON.stringify({ event: "onboarding_start_failed" }));
  }
}

type StateRow = {
  tracked: boolean; dismissed: boolean; welcome_status: string | null; system_type: SystemType | null; goal: Goal | null; example_hidden: boolean;
  has_connection: boolean; has_sources: boolean; has_run: boolean; results_read: boolean; has_colleague: boolean; first_evaluation_id: string | null;
};

/** The activation checklist and welcome for one workspace, from real state. */
export function getWorkspaceOnboarding(scope: EvidenceScope): Promise<WorkspaceOnboarding> {
  const enabled = onboardingEnabled();
  return withTenant(scope, async (db) => {
    const row = (await db.query("SELECT * FROM evals.workspace_onboarding_state($1)", [scope.orgId])).rows[0] as StateRow;
    const steps = { connect: row.has_connection, sources: row.has_sources, run: row.has_run, results: row.results_read, invite: row.has_colleague };
    return {
      enabled, tracked: row.tracked, dismissed: row.dismissed, steps, complete: CHECKLIST_STEPS.every((step) => steps[step]),
      welcome: { pending: row.tracked && row.welcome_status === "pending", systemType: row.system_type, goal: row.goal },
      exampleHidden: row.example_hidden, firstEvaluationId: row.first_evaluation_id,
    };
  }).catch(domainError);
}

export type OnboardingUpdate =
  | { action: "dismiss" | "restore" | "skip" | "hide_example" | "show_example" }
  | { action: "answer"; systemType: SystemType | null; goal: Goal | null };

export async function updateWorkspaceOnboarding(scope: EvidenceScope, input: OnboardingUpdate) {
  await withTenant(scope, (db) => db.query("SELECT 1 FROM evals.update_workspace_onboarding($1,$2,$3,$4)", [
    scope.orgId, input.action, input.action === "answer" ? input.systemType : null, input.action === "answer" ? input.goal : null,
  ])).catch(domainError);
  return getWorkspaceOnboarding(scope);
}
