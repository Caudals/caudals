import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";
import { boundedOutputTokens, invocationSchema } from "../providers/contracts";
import { digest, enqueueInvocation, type Tenant } from "../queue/store";
import { reportSnapshotSchema, type ReportSnapshot } from "../reports/contracts";
import { refsToJson, questionRefs } from "../reports/question-refs";
import {
  PACKET_MAX_BYTES, QUESTION_DEADLINE_MS, QUESTION_MAX_CHARS, QUESTION_OUTPUT_TOKENS, QUESTION_TIMEOUT_MS, QUESTIONS_FREE_MONTH,
  QUESTIONS_PER_REPORT_DAY, REPORT_QUESTION_PROMPT_REVISION, answerMatchesSnapshot, questionLanguage, questionPrompt, scopeRule,
  type QuestionAnswer, type QuestionLanguage, type QuestionStatus,
} from "../reports/questions";
import { engineBillingMode, engineChargeUcr, engineHoldUcr, workspaceEngineMode } from "../../billing/engine";
import { getCreditAccount } from "../../billing/ledger";
import { formatEuroEquivalent, ucrToCredits, wholeCreditsUp } from "../../billing/units";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { withTenant } from "./db";
import { ensureWorkspaceBudget, resolveModelRoute, routingFor, type ModelRoute } from "./model-routes";
import type { EvidenceScope } from "./evidence";

/**
 * "Ask your report" (launch L-36; spec v2 P-58). A workspace member asks a
 * question about one report revision; the answer is a bounded engine job on
 * the report's model route (lib/evals/reports/questions.ts for the rules,
 * question-worker.ts for the engine side). This module is the web side:
 * state, asking, reading one question and erasing it.
 */

type Row = Record<string, unknown>;
type Role = "owner" | "editor" | "viewer" | "operator" | null;

export interface QuestionRef { kind: "result" | "finding"; id: string; label: string }
export interface QuestionView {
  id: string;
  revisionId: string;
  question: string;
  language: QuestionLanguage;
  status: QuestionStatus;
  reason: string | null;
  sentences: Array<{ text: string; refs: QuestionRef[] }> | null;
  /** Credits charged for the answer (enforced credits only); null when nothing was charged. */
  credits: string | null;
  createdAt: string;
  finishedAt: string | null;
}
export interface QuestionCost {
  basis: "credits" | "contract" | "own_key" | "free_model" | "unavailable";
  typicalCredits: string | null;
  maxCredits: string | null;
  typicalEuro: string | null;
}

/* ---------------------------------------------------------------- reads --- */

async function revisionFor(db: PoolClient, orgId: string, reportId: string, revisionId: string) {
  const row = (await db.query(`SELECT rr.id,rr.snapshot,rr.run_id,r.evaluation_id,e.commercial_cap,e.currency
      FROM evals.report_revision rr
      JOIN evals.report rep ON (rep.org_id,rep.id)=(rr.org_id,rr.report_id) AND rep.archived_at IS NULL
      JOIN evals.run r ON (r.org_id,r.id)=(rr.org_id,rr.run_id)
      JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
      WHERE rr.org_id=$1 AND rr.id=$2 AND rr.report_id=$3`, [orgId, revisionId, reportId])).rows[0];
  if (!row) throw new EvalError("SCOPE_DENIED", 404, "That report is not available.");
  return { ...row, snapshot: reportSnapshotSchema.parse(row.snapshot) } as { id: string; snapshot: ReportSnapshot; run_id: string; evaluation_id: string; commercial_cap: string; currency: string };
}

/** The person's workspace role; `admin` is the platform-admin identity the route already resolved (audited support access). */
async function roleOf(db: PoolClient, orgId: string, actorId: string, admin: boolean): Promise<{ role: Role; admin: boolean }> {
  const member = (await db.query("SELECT role FROM evals.membership WHERE org_id=$1 AND user_id=$2", [orgId, actorId])).rows[0];
  return { role: (member?.role ?? null) as Role, admin };
}
const mayAsk = (access: { role: Role; admin: boolean }) => access.admin || ["owner", "editor", "operator"].includes(access.role ?? "");
const mayDelete = (access: { role: Role; admin: boolean }) => access.admin || ["owner", "operator"].includes(access.role ?? "");

/**
 * The report's model route, frozen into the question: the run's own report
 * writer while its model is still available, otherwise the workspace's
 * current one. Free workspaces may use only the local model.
 */
async function questionRoute(db: PoolClient, orgId: string, runId: string, evaluationId: string): Promise<{ route: ModelRoute; source: "run" | "workspace"; customerKey: boolean } | null> {
  const available = async (route: ModelRoute | null) => {
    if (!route) return null;
    const row = (await db.query(`SELECT p.org_id FROM evals.provider_revision p JOIN evals.provider_account a ON a.id=p.account_id
      WHERE p.id=$1 AND a.enabled AND (p.retired_at IS NULL OR p.retired_at>now())`, [route.provider_revision_id])).rows[0];
    return row ? { route, customerKey: row.org_id !== null } : null;
  };
  const frozen = await available(await resolveModelRoute(db, orgId, "report_writer", evaluationId, { kind: "run", id: runId }));
  if (frozen) return { ...frozen, source: "run" };
  const current = await available(await resolveModelRoute(db, orgId, "report_writer", evaluationId));
  return current ? { ...current, source: "workspace" } : null;
}

async function planOf(db: PoolClient, orgId: string): Promise<string | null> {
  return (await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [orgId])).rows[0]?.plan ?? null;
}

function packetLimit(route: Pick<ModelRoute, "context_limit" | "output_limit">) {
  // The prompt bound is bytes + 1 KB of template headroom; keep 6 KB for the rules and the question.
  return Math.min(PACKET_MAX_BYTES, route.context_limit - Math.min(QUESTION_OUTPUT_TOKENS, route.output_limit) - 1024 - 6000);
}

/** The bound of one call, and what a typical question costs on this route (§6.3: engine tokens, no separate meter). */
async function costOf(db: PoolClient, orgId: string, route: ModelRoute, customerKey: boolean, snapshot: ReportSnapshot) {
  const limit = packetLimit(route);
  if (limit < 4000) return null;
  const prompt = questionPrompt(snapshot, "x".repeat(120), "en", limit);
  // A report whose findings and method alone do not fit cannot be asked about on this model.
  if (prompt.packet.bytes > limit) return null;
  const outputBound = boundedOutputTokens(prompt.messages, route.context_limit, route.output_limit, QUESTION_OUTPUT_TOKENS);
  const promptBytes = Buffer.byteLength(JSON.stringify(prompt.messages), "utf8");
  const inputBound = promptBytes + 1024;
  let cost: QuestionCost = { basis: "unavailable", typicalCredits: null, maxCredits: null, typicalEuro: null };
  let holdUcr = BigInt(0);
  if (customerKey) cost = { ...cost, basis: "own_key" };
  else {
    try {
      await db.query("SAVEPOINT question_pricing");
      const row = (await db.query("SELECT * FROM billing.engine_pricing($1,$2,$3)", [orgId, route.provider_revision_id, inputBound])).rows[0];
      await db.query("RELEASE SAVEPOINT question_pricing");
      const rates = row.input_ucr_per_m !== null && row.output_ucr_per_m !== null
        ? { inputUcrPerMillion: BigInt(row.input_ucr_per_m), outputUcrPerMillion: BigInt(row.output_ucr_per_m), ...(row.cached_ucr_per_m !== null ? { cachedUcrPerMillion: BigInt(row.cached_ucr_per_m) } : {}) } : null;
      const pricing = { free: row.free_model === true, rates };
      holdUcr = engineHoldUcr(pricing, { input: inputBound, output: outputBound });
      // Typical: a token is about three bytes of report text, and an answer about 300 tokens.
      const typical = engineChargeUcr(pricing, { input: Math.ceil(promptBytes / 3), output: Math.min(300, outputBound), cached: 0 });
      cost = row.billing_mode === "contract" ? { ...cost, basis: "contract" }
        : pricing.free ? { ...cost, basis: "free_model" }
        : rates ? { basis: "credits", typicalCredits: wholeCreditsUp(typical).toString(), maxCredits: wholeCreditsUp(holdUcr).toString(), typicalEuro: formatEuroEquivalent(typical) }
        : cost;
    } catch {
      await db.query("ROLLBACK TO SAVEPOINT question_pricing").catch(() => undefined);
    }
  }
  return { limit, inputBound, outputBound, holdUcr, cost };
}

function view(row: Row, snapshot: Pick<ReportSnapshot, "results" | "findings">): QuestionView {
  const refs = questionRefs(snapshot);
  let status = row.status as QuestionStatus, reason = (row.reason_code as string | null) ?? null;
  const answer = row.answer as QuestionAnswer | null;
  let sentences: QuestionView["sentences"] = null;
  if (status === "answered") {
    // Defence in depth: an answer is shown only while every citation is in this revision's snapshot.
    if (answerMatchesSnapshot(answer, snapshot)) {
      sentences = answer!.sentences.map((sentence) => ({
        text: sentence.text,
        refs: [
          ...sentence.result_ids.map((id) => ({ kind: "result" as const, id, label: refs.resultRef.get(id)! })),
          ...sentence.finding_ids.map((id) => ({ kind: "finding" as const, id, label: refs.findingRef.get(id)! })),
        ],
      }));
    } else { status = "unanswerable"; reason = "citation_invalid"; }
  }
  const charged = BigInt(String(row.charged_ucr ?? 0));
  return {
    id: row.id as string, revisionId: row.report_revision_id as string, question: row.question as string, language: row.language as QuestionLanguage,
    status, reason, sentences,
    credits: row.ledger_mode === "enforce" && row.ledger_outcome === "captured" && charged > BigInt(0) ? ucrToCredits(charged) : null,
    createdAt: new Date(row.created_at as string).toISOString(), finishedAt: row.finished_at ? new Date(row.finished_at as string).toISOString() : null,
  };
}

async function usage(db: PoolClient, orgId: string, reportId: string, plan: string | null) {
  const counted = "status NOT IN ('failed','timed_out')";
  const today = (await db.query(`SELECT count(*)::int AS n FROM evals.report_question WHERE org_id=$1 AND report_id=$2 AND ${counted}
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [orgId, reportId])).rows[0].n as number;
  const month = plan === "free" ? (await db.query(`SELECT count(*)::int AS n FROM evals.report_question WHERE org_id=$1 AND ${counted}
    AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [orgId])).rows[0].n as number : null;
  const remaining = Math.max(0, Math.min(QUESTIONS_PER_REPORT_DAY - today, month === null ? Infinity : QUESTIONS_FREE_MONTH - month));
  return { perReportDay: QUESTIONS_PER_REPORT_DAY, usedToday: today, freeMonth: plan === "free" ? QUESTIONS_FREE_MONTH : null, usedMonth: month, remaining };
}

/** The panel's state for one revision: whether this person may ask, the limits, the typical cost and the stored questions. */
export function reportQuestionsState(scope: EvidenceScope, reportId: string, revisionId: string, options: { enabled: boolean; admin: boolean }) {
  const { enabled } = options;
  return withTenant(scope, async (db) => {
    const revision = await revisionFor(db, scope.orgId, reportId, revisionId);
    const access = await roleOf(db, scope.orgId, scope.actorId, options.admin);
    const plan = await planOf(db, scope.orgId);
    const rows = (await db.query(`SELECT * FROM evals.report_question WHERE org_id=$1 AND report_id=$2 AND report_revision_id=$3 AND deleted_at IS NULL
      ORDER BY created_at, id LIMIT 200`, [scope.orgId, reportId, revisionId])).rows;
    let cost: QuestionCost = { basis: "unavailable", typicalCredits: null, maxCredits: null, typicalEuro: null };
    if (enabled) {
      const chosen = await questionRoute(db, scope.orgId, revision.run_id, revision.evaluation_id);
      const permitted = chosen && !(plan === "free" && chosen.route.adapter !== "dgx");
      if (chosen && permitted) cost = (await costOf(db, scope.orgId, chosen.route, chosen.customerKey, revision.snapshot))?.cost ?? cost;
    }
    return {
      enabled, canAsk: enabled && mayAsk(access), canDelete: mayDelete(access),
      limits: await usage(db, scope.orgId, reportId, plan), cost,
      questions: rows.map((row) => view(row, revision.snapshot)),
    };
  });
}

export function getReportQuestion(scope: EvidenceScope, reportId: string, questionId: string) {
  return withTenant(scope, async (db) => {
    const row = (await db.query("SELECT * FROM evals.report_question WHERE org_id=$1 AND report_id=$2 AND id=$3 AND deleted_at IS NULL", [scope.orgId, reportId, questionId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404, "That question is not available.");
    const revision = await revisionFor(db, scope.orgId, reportId, row.report_revision_id);
    // Shown as waiting until the worker settles it; past its deadline it can only end without a charge.
    return view(row, revision.snapshot);
  });
}

/* ---------------------------------------------------------------- writes --- */

function limitError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("REPORT_QUESTION_DAILY_LIMIT")) throw new EvalError("REPORT_QUESTION_DAILY_LIMIT", 429, `You can ask ${QUESTIONS_PER_REPORT_DAY} questions about a report a day. Try again tomorrow.`);
  if (message.includes("REPORT_QUESTION_MONTHLY_LIMIT")) throw new EvalError("REPORT_QUESTION_MONTHLY_LIMIT", 429, `The free plan includes ${QUESTIONS_FREE_MONTH} report questions a month.`);
  throw error;
}

export interface AskInput { revisionId: string; question: string; locale: QuestionLanguage; admin: boolean }

/**
 * Asks one question. A question that asks for a compliance, certification or
 * legal conclusion is refused at once (no model call, nothing charged);
 * anything else becomes one queued report-writer call whose answer the worker
 * validates. Caps are enforced by the database.
 */
export function askReportQuestion(scope: EvidenceScope, reportId: string, input: AskInput) {
  const text = input.question.replace(/\s+/g, " ").trim();
  if (!text || text.length > QUESTION_MAX_CHARS) throw new EvalError("INPUT_INVALID", 400, `Ask in 1 to ${QUESTION_MAX_CHARS} characters.`);
  return withTenant(scope, async (db) => {
    const revision = await revisionFor(db, scope.orgId, reportId, input.revisionId);
    if (!mayAsk(await roleOf(db, scope.orgId, scope.actorId, input.admin))) throw new EvalError("SCOPE_DENIED", 404);
    const language = questionLanguage(text, input.locale);
    const refs = questionRefs(revision.snapshot);
    const id = randomUUID();
    const base = { id, org_id: scope.orgId, report_id: reportId, report_revision_id: revision.id, run_id: revision.run_id, asked_by: scope.actorId, question: text, language };
    const insert = (fields: Record<string, unknown>) => {
      const row = { ...base, prompt_revision: REPORT_QUESTION_PROMPT_REVISION, refs: JSON.stringify(refsToJson(refs)), ...fields };
      const keys = Object.keys(row);
      return db.query(`INSERT INTO evals.report_question(${keys.join(",")}) VALUES(${keys.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(row)).catch(limitError);
    };
    const refused = scopeRule(text);
    if (refused) {
      await insert({ status: "refused", reason_code: refused, ledger_outcome: "none", deadline_at: new Date(), finished_at: new Date() });
      await recordProductEvent({ eventName: "report_question_asked", source: "server", orgId: scope.orgId, eventKey: id, payload: { outcome: "refused", credits: 0 } }, db);
      const row = (await db.query("SELECT * FROM evals.report_question WHERE org_id=$1 AND id=$2", [scope.orgId, id])).rows[0];
      return view(row, revision.snapshot);
    }
    const chosen = await questionRoute(db, scope.orgId, revision.run_id, revision.evaluation_id);
    if (!chosen) throw new EvalError("REPORT_QUESTION_MODEL_UNAVAILABLE", 409, "No model is available to answer questions about this report.");
    const plan = await planOf(db, scope.orgId);
    if (plan === "free" && chosen.route.adapter !== "dgx") throw new EvalError("REPORT_QUESTION_MODEL_NOT_PERMITTED", 409, "The free plan answers questions with the local model only.");
    const { route } = chosen;
    const priced = await costOf(db, scope.orgId, route, chosen.customerKey, revision.snapshot);
    if (!priced) throw new EvalError("REPORT_QUESTION_MODEL_UNAVAILABLE", 409, "This report's model cannot read the report in one question.");
    // Enforce mode: a question starts only when its hold (the call's bound) is covered.
    const mode = await workspaceEngineMode(db, engineBillingMode(), scope.orgId);
    if (mode === "enforce" && priced.holdUcr > BigInt(0)) {
      const account = await getCreditAccount(db, scope.orgId);
      if (account && account.billingMode !== "contract" && account.availableUcr < priced.holdUcr)
        throw new EvalError("CREDITS_EXHAUSTED", 402, `Not enough credits to ask a question. Add ${wholeCreditsUp(priced.holdUcr - account.availableUcr).toString()} credits to continue.`);
    }
    const workspaceBudget = await ensureWorkspaceBudget(db, scope.orgId, revision.currency);
    if (!workspaceBudget || workspaceBudget.currency !== route.currency || revision.currency !== route.currency)
      throw new EvalError("REPORT_QUESTION_MODEL_UNAVAILABLE", 409, "No budget is available to answer questions about this report.");
    const prompt = questionPrompt(revision.snapshot, text, language, priced.limit);
    const maxOutputTokens = boundedOutputTokens(prompt.messages, route.context_limit, route.output_limit, QUESTION_OUTPUT_TOKENS);
    const runBudget = (await db.query("INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'run',$2,$3,$4) RETURNING id",
      [scope.orgId, id, revision.currency, revision.commercial_cap])).rows[0];
    const invocation = invocationSchema.parse({
      probe: false, probeKind: "text", outputFormat: "json_object", reportQuestionId: id,
      providerRevisionId: route.provider_revision_id, priceRevisionId: route.price_revision_id,
      workspaceBudgetId: workspaceBudget.id, runBudgetId: runBudget.id, role: "report_writer",
      dataClass: route.data_class, region: route.region, ...routingFor(route),
      messages: prompt.messages, maxOutputTokens,
      timeoutMs: route.adapter === "dgx" ? QUESTION_TIMEOUT_MS.local : QUESTION_TIMEOUT_MS.commercial,
      internalCostPerSecond: route.internal_cost_per_second,
    });
    const workflowId = randomUUID();
    const stepId = await enqueueInvocation(db, scope as Tenant, { workflowId, runId: id, planHash: digest({ reportQuestionId: id, revisionId: revision.id }), kind: "grade", version: 1, input: invocation });
    await insert({
      status: "queued", packet_hash: prompt.packetHash, model_revision_id: route.provider_revision_id, price_revision_id: route.price_revision_id,
      model_id: route.model_id, model_source: chosen.source, data_routing: chosen.customerKey ? "customer_provider" : routingFor(route).routing,
      workflow_id: workflowId, step_id: stepId, input_bound: Buffer.byteLength(JSON.stringify(prompt.messages), "utf8") + 1024, output_bound: maxOutputTokens,
      ledger_outcome: "pending", deadline_at: new Date(Date.now() + QUESTION_DEADLINE_MS),
    });
    const row = (await db.query("SELECT * FROM evals.report_question WHERE org_id=$1 AND id=$2", [scope.orgId, id])).rows[0];
    return view(row, revision.snapshot);
  });
}

/** Owners and operators erase a question and its answer (metadata and ledger references stay). Works with the flag off. */
export function deleteReportQuestion(scope: EvidenceScope, reportId: string, questionId: string, admin: boolean) {
  return withTenant(scope, async (db) => {
    const row = (await db.query("SELECT id FROM evals.report_question WHERE org_id=$1 AND report_id=$2 AND id=$3 AND deleted_at IS NULL", [scope.orgId, reportId, questionId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404, "That question is not available.");
    if (!mayDelete(await roleOf(db, scope.orgId, scope.actorId, admin))) throw new EvalError("SCOPE_DENIED", 403, "Only owners can delete questions.");
    const deleted = (await db.query("SELECT evals.delete_report_question($1) AS ok", [questionId])).rows[0].ok === true;
    return { id: questionId, deleted };
  });
}
