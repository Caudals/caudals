import "server-only";

import { randomUUID } from "node:crypto";
import { withContentHash } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import { withTenant } from "../repositories/db";
import { idempotent } from "../repositories/identity";
import { buildReportSnapshot, reportSnapshotSchema, type ReportSnapshot } from "../reports/contracts";
import { expertReviewLabel } from "../reports/summary";
import { expertGuidelineSchema } from "./contracts";
import { buildExpertExcerpts, orderEvidence, orderSeverity } from "./redaction";
import {
  missingOnboarding,
  type CustomerReviewRequest,
  type ExpertOnboardingInput,
  type ReviewOrderInput,
  type ReviewRequestInput,
} from "./review-contracts";

// Expert review from request to reviewed report (launch L-26, spec v2 P-10,
// P-32, P-33). Every write goes through the SECURITY DEFINER functions of
// migration 101, which check the caller's membership or operator role in SQL
// and write the audit trail. Experts never reach this module: their only
// path is the Stage E workbench (lib/evals/experts/store.ts), which shows the
// redacted evidence of their own assignments.

type Scope = { orgId: string; actorId: string };

function domainError(error: unknown): never {
  if (error instanceof EvalError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (message === "SCOPE_DENIED" || message === "SESSION_REQUIRED") throw new EvalError("SCOPE_DENIED", 404, "Not found.");
  if (message === "INPUT_INVALID") throw new EvalError("INPUT_INVALID", 422, "Check the supplied fields.");
  if (message === "REVIEW_STATE") throw new EvalError("VERSION_CONFLICT", 409, "This request or order has moved on. Reload to see its current state.");
  if (message === "EXPERT_NOT_READY") throw new EvalError("EXPERT_NOT_READY", 422, "Every expert needs a complete onboarding checklist before order work.");
  if (message === "EXPERT_REVIEW_UNRECORDED") throw new EvalError("EXPERT_REVIEW_UNRECORDED", 409, "No expert has submitted work on this order yet.");
  throw error;
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

/* ------------------------------------------------------------ customer --- */

type RequestRow = { id: string; status: CustomerReviewRequest["status"]; scope_kind: CustomerReviewRequest["scopeKind"]; created_at: Date; reply_due_at: Date; due_at: Date | null; delivered_at: Date | null };
const customerView = (row: RequestRow): CustomerReviewRequest => ({
  id: row.id, status: row.status, scopeKind: row.scope_kind, createdAt: iso(row.created_at)!, replyDueAt: iso(row.reply_due_at)!,
  dueAt: iso(row.due_at), deliveredAt: iso(row.delivered_at),
});

/** The request a member sees on a report: the open one, else the latest from the last 90 days. */
export function getReportReviewRequest(scope: Scope, reportId: string) {
  return withTenant(scope, async (db) => {
    const row = (await db.query<RequestRow>(`SELECT id,status,scope_kind,created_at,reply_due_at,due_at,delivered_at FROM evals.review_request
      WHERE org_id=$1 AND report_id=$2 AND (status IN ('requested','quoted','ordered') OR created_at>now()-interval '90 days')
      ORDER BY (status IN ('requested','quoted','ordered')) DESC,created_at DESC LIMIT 1`, [scope.orgId, reportId])).rows[0];
    return row ? customerView(row) : null;
  });
}

/**
 * "Have an expert review this" (P-10): opens one request per report with its
 * Warmbly CRM draft (never sent). The caller emails the founders afterwards.
 */
export function requestExpertReview(scope: Scope, reportId: string, input: ReviewRequestInput, contact: { name: string; email: string }) {
  return withTenant(scope, async (db) => {
    const context = (await db.query<{ workspace: string; title: string; system: string | null; review_status: string; metrics: Record<string, unknown> | null }>(
      `SELECT w.name AS workspace,r.title,rr.snapshot->'system'->>'name' AS system,rr.review_status,rr.snapshot->'metrics' AS metrics
       FROM evals.report r JOIN evals.workspace w ON w.id=r.org_id
       JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(r.org_id,r.current_revision_id)
       WHERE r.org_id=$1 AND r.id=$2 AND r.publication_status='published'`, [scope.orgId, reportId])).rows[0];
    if (!context) throw new EvalError("SCOPE_DENIED", 404, "Publish the report before asking for a review.");
    const metrics = context.metrics ?? {};
    // The handoff an operator copies into Warmbly, the CRM of record (launch L-21 pattern). Nothing is sent.
    const crm = {
      status: "draft_for_operator_review", company: context.workspace.slice(0, 160), workspace_id: scope.orgId, report_id: reportId,
      title: context.title.slice(0, 160), system: (context.system ?? "").slice(0, 160), review_status: context.review_status,
      planned_count: Number(metrics.n_planned ?? 0), assessed_count: Number(metrics.n_scorable ?? 0), pass_count: Number(metrics.n_pass ?? 0),
      contact: { name: contact.name.slice(0, 160), email: contact.email.slice(0, 254) },
      request: { surface: input.surface, scope_kind: input.scopeKind, deadline: input.deadline ?? null, sector: input.sector, locale: input.locale, note: input.scopeNote || null },
      next_step: "reply_with_hand_written_quote_within_one_working_day",
      tags: ["caudals-expert-review", `lang-${input.locale}`, `sector-${input.sector}`],
    };
    const row = (await db.query<{ id: string; created: boolean; notified: boolean; status: RequestRow["status"]; reply_due_at: Date; due_at: Date | null; created_at: Date }>(
      "SELECT * FROM evals.request_expert_review($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [scope.orgId, reportId, input.surface, input.scopeKind, input.scopeNote || null, input.deadline ?? null, input.sector, input.locale, crm],
    )).rows[0];
    return {
      request: customerView({ ...row, scope_kind: input.scopeKind, delivered_at: null }),
      created: row.created, notified: row.notified,
      context: { workspace: context.workspace, report: context.title },
    };
  }).catch(domainError);
}

export function markReviewRequestNotified(scope: Scope, requestId: string) {
  return withTenant(scope, (db) => db.query("SELECT evals.mark_review_request_notified($1,$2)", [scope.orgId, requestId])).catch(domainError);
}

/* ----------------------------------------------------------------- ops --- */

/** Every request, newest first, with its order and SLA facts (operators only). */
export function listReviewRequests(actorId: string) {
  return withTenant({ orgId: "", actorId }, async (db) => {
    if (!(await db.query<{ ok: boolean }>("SELECT evals.is_operator() AS ok")).rows[0]?.ok) throw new EvalError("SCOPE_DENIED", 404);
    // Workspaces are visible to platform admins and members only, so the CRM draft's company name stands in.
    return (await db.query(`SELECT q.id,q.org_id,coalesce(w.name,d.summary->>'company') AS workspace,d.summary->>'title' AS report_title,q.report_id,q.surface,q.scope_kind,
        q.sector,q.deadline,q.locale,q.status,q.created_at,q.reply_due_at,q.replied_at,q.due_at,q.delivered_at,
        o.id AS order_id,o.status AS order_status,o.reviewer_count
      FROM evals.review_request q LEFT JOIN evals.workspace w ON w.id=q.org_id
      LEFT JOIN evals.review_crm_draft d ON (d.org_id,d.request_id)=(q.org_id,q.id)
      LEFT JOIN evals.review_order o ON (o.org_id,o.request_id)=(q.org_id,q.id)
      ORDER BY (q.status IN ('requested','quoted','ordered')) DESC,q.created_at DESC LIMIT 200`)).rows;
  });
}

/** The request's workspace, for the route's workspace check before any tenant read. */
export function reviewRequestWorkspace(actorId: string, requestId: string) {
  return withTenant({ orgId: "", actorId }, async (db) => {
    const row = (await db.query<{ org_id: string }>("SELECT org_id FROM evals.review_request WHERE id=$1 AND evals.is_operator()", [requestId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    return row.org_id;
  });
}

type ResultOption = { id: string; title: string; topic: string; outcome: string; severity: string; label: string | null };

/** One request in full for ops: the request, its CRM draft, the order with its assignments, and the report's results to choose a scope from. */
export function readReviewRequest(scope: Scope, requestId: string) {
  return withTenant(scope, async (db) => {
    if (!(await db.query<{ ok: boolean }>("SELECT evals.is_operator() AS ok")).rows[0]?.ok) throw new EvalError("SCOPE_DENIED", 404);
    const request = (await db.query(`SELECT q.*,coalesce(w.name,d.summary->>'company') AS workspace FROM evals.review_request q
      LEFT JOIN evals.workspace w ON w.id=q.org_id LEFT JOIN evals.review_crm_draft d ON (d.org_id,d.request_id)=(q.org_id,q.id)
      WHERE q.org_id=$1 AND q.id=$2`, [scope.orgId, requestId])).rows[0];
    if (!request) throw new EvalError("SCOPE_DENIED", 404);
    const draft = (await db.query("SELECT id,summary,created_at FROM evals.review_crm_draft WHERE org_id=$1 AND request_id=$2", [scope.orgId, requestId])).rows[0] ?? null;
    const report = (await db.query<{ title: string; current_revision_id: string | null; snapshot: ReportSnapshot | null }>(
      `SELECT r.title,r.current_revision_id,rr.snapshot FROM evals.report r
       LEFT JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(r.org_id,r.current_revision_id)
       WHERE r.org_id=$1 AND r.id=$2`, [scope.orgId, request.report_id])).rows[0];
    const results: ResultOption[] = (report?.snapshot?.results ?? []).map((item) => ({
      id: item.assessment_id, title: item.title, topic: item.topic, outcome: item.outcome, severity: item.severity, label: item.label ?? null,
    }));
    const order = (await db.query("SELECT * FROM evals.review_order WHERE org_id=$1 AND request_id=$2", [scope.orgId, requestId])).rows[0] ?? null;
    let assignments: unknown[] = [];
    let progress = { reviewer_count: 0, assignment_count: 0 };
    if (order) {
      assignments = (await db.query(`SELECT a.id,a.status,a.due_at,a.updated_at,l.expert_profile_id,p.user_id AS expert_user_id,
          (SELECT count(*)::int FROM evals.expert_submission_revision s WHERE (s.org_id,s.assignment_id)=(a.org_id,a.id)) AS revisions,
          (SELECT max(s.created_at) FROM evals.expert_submission_revision s WHERE (s.org_id,s.assignment_id)=(a.org_id,a.id) AND s.status='submitted') AS submitted_at
        FROM evals.review_order_assignment l JOIN evals.expert_assignment a ON (a.org_id,a.id)=(l.org_id,l.assignment_id)
        JOIN evals.expert_profile p ON p.id=l.expert_profile_id
        WHERE l.org_id=$1 AND l.order_id=$2 ORDER BY l.created_at,a.id`, [scope.orgId, order.id])).rows;
      progress = (await db.query("SELECT * FROM evals.review_order_progress($1)", [order.id])).rows[0] ?? progress;
    }
    return {
      request: { ...request, scope_note: request.scope_note ?? null },
      draft, report: report ? { title: report.title, currentRevisionId: report.current_revision_id, reviewStatus: report.snapshot?.scope.review_status ?? null, expertReview: report.snapshot?.expert_review ?? null } : null,
      results, order, assignments, progress,
    };
  });
}

/** Ops: the reply (a hand-written quote) went out, or the request is declined. */
export function updateReviewRequest(actorId: string, requestId: string, action: "quoted" | "declined", reason: string | null) {
  return withTenant({ orgId: "", actorId }, async (db) => ({
    status: (await db.query<{ status: string }>("SELECT evals.update_review_request($1,$2,$3) AS status", [requestId, action, reason])).rows[0].status,
  })).catch(domainError);
}

type OrderContext = { request: { id: string; status: string; locale: "en" | "es"; report_id: string }; workspace: string; title: string; projectId: string; snapshot: ReportSnapshot };

async function orderContext(db: import("pg").PoolClient, orgId: string, requestId: string): Promise<OrderContext> {
  const row = (await db.query(`SELECT q.id,q.status,q.locale,q.report_id,coalesce(w.name,d.summary->>'company','') AS workspace,r.title,r.project_id,rr.snapshot
    FROM evals.review_request q LEFT JOIN evals.workspace w ON w.id=q.org_id
    LEFT JOIN evals.review_crm_draft d ON (d.org_id,d.request_id)=(q.org_id,q.id)
    JOIN evals.report r ON (r.org_id,r.id)=(q.org_id,q.report_id)
    JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(r.org_id,r.current_revision_id)
    WHERE q.org_id=$1 AND q.id=$2 AND r.publication_status='published'`, [orgId, requestId])).rows[0];
  if (!row) throw new EvalError("SCOPE_DENIED", 404);
  return { request: { id: row.id, status: row.status, locale: row.locale, report_id: row.report_id }, workspace: row.workspace, title: row.title, projectId: row.project_id, snapshot: reportSnapshotSchema.parse(row.snapshot) };
}

const namesOf = (context: OrderContext) => [context.workspace, context.snapshot.system.name, context.title];

/** Ops: the redacted excerpts an order would give its experts, to check before creating it. */
export function previewOrderExcerpts(scope: Scope, requestId: string, resultIds: string[]) {
  return withTenant(scope, async (db) => {
    if (!(await db.query<{ ok: boolean }>("SELECT evals.is_operator() AS ok")).rows[0]?.ok) throw new EvalError("SCOPE_DENIED", 404);
    const context = await orderContext(db, scope.orgId, requestId);
    const excerpts = buildExpertExcerpts(context.snapshot, resultIds, { locale: context.request.locale, names: namesOf(context) });
    if (!excerpts.length) throw new EvalError("INPUT_INVALID", 422, "Choose at least one result from the current report.");
    return { excerpts, severity: orderSeverity(context.snapshot, resultIds) };
  });
}

const GUIDELINE = {
  en: {
    title: "Expert review: {scope}",
    instructions: [
      "Review the redacted questions and answers in this assignment. For each one, say whether the automatic grade is right and why, citing the reference excerpt when there is one.",
      "Write one line per question in Answer, for example \"Q1: agree. The answer matches the excerpt.\" or \"Q2: disagree. The fee is wrong.\" Use Rationale for what the questions have in common and the risks for the company's customers.",
      "Work only from this material. Do not look up the company or its assistant, do not contact anyone about it and do not keep copies: the work is confidential and covered by your contract, the data-processing agreement and the IP assignment.",
      "Flag ambiguity, a missing source or a question about this guideline instead of guessing.",
    ].join("\n\n"),
    criteria: [
      ["grade_check", "Every question has a verdict on its grade (agree or disagree) with a reason."],
      ["grounding", "Each verdict cites the reference excerpt, or says that none was given."],
      ["risk", "Answers that could mislead or harm a customer are named, even when graded correct."],
      ["confidentiality", "Only the material in this assignment was used."],
    ],
  },
  es: {
    title: "Revisión experta: {scope}",
    instructions: [
      "Revisa las preguntas y respuestas anonimizadas de esta tarea. Para cada una, indica si la calificación automática es correcta y por qué, citando el extracto de referencia cuando lo haya.",
      "Escribe una línea por pregunta en Respuesta, por ejemplo «P1: de acuerdo. La respuesta coincide con el extracto.» o «P2: en desacuerdo. La comisión es incorrecta.». Usa Justificación para lo que tienen en común las preguntas y los riesgos para los clientes de la empresa.",
      "Trabaja solo con este material. No busques la empresa ni su asistente, no contactes con nadie sobre ello y no guardes copias: el trabajo es confidencial y está cubierto por tu contrato, el acuerdo de tratamiento de datos y la cesión de propiedad intelectual.",
      "Señala ambigüedades, fuentes que faltan o dudas sobre esta guía en lugar de suponer.",
    ].join("\n\n"),
    criteria: [
      ["grade_check", "Cada pregunta tiene un veredicto sobre su calificación (de acuerdo o en desacuerdo) con un motivo."],
      ["grounding", "Cada veredicto cita el extracto de referencia o indica que no había ninguno."],
      ["risk", "Se señalan las respuestas que podrían confundir o perjudicar a un cliente, aunque estén calificadas como correctas."],
      ["confidentiality", "Solo se ha usado el material de esta tarea."],
    ],
  },
} as const;

/**
 * Ops turns a request into an order (P-32): the order with its hand-written
 * quote, a guideline revision for its project and one authoring assignment
 * per expert, each carrying the same redacted excerpts. One transaction: an
 * expert who is not ready (evals.expert_ready) undoes the whole order.
 */
export function createReviewOrder(scope: Scope, requestId: string, input: ReviewOrderInput, key: string) {
  return withTenant(scope, async (db) => idempotent(db, scope.actorId, `review-orders/${scope.orgId}/${requestId}`, key, input, async () => {
    const context = await orderContext(db, scope.orgId, requestId);
    const excerpts = buildExpertExcerpts(context.snapshot, input.resultIds, { locale: context.request.locale, names: namesOf(context) });
    if (excerpts.length !== new Set(input.resultIds).size) throw new EvalError("INPUT_INVALID", 422, "Every chosen result must be in the current report.");
    const evidence = orderEvidence(excerpts);
    const severity = orderSeverity(context.snapshot, input.resultIds);
    const copy = GUIDELINE[context.request.locale];
    const revisionId = randomUUID();
    const guideline = expertGuidelineSchema.parse(withContentHash({
      schema_version: "1.0", revision_id: revisionId,
      title: copy.title.replace("{scope}", input.scope).slice(0, 200), instructions: copy.instructions,
      criteria: copy.criteria.map(([id, description]) => ({ id, description, required: true })),
      created_at: new Date().toISOString(),
    }));
    await db.query(`INSERT INTO evals.expert_guideline_revision(id,org_id,project_id,guideline_id,supersedes_revision_id,content_hash,document)
      VALUES($1,$2,$3,$4,NULL,$5,$6)`, [revisionId, scope.orgId, context.projectId, randomUUID(), guideline.content_hash, guideline]);
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'expert_guideline.created',$3)", [scope.orgId, scope.actorId, revisionId]);
    const orderId = (await db.query<{ id: string }>("SELECT evals.create_review_order($1,$2,$3,$4,$5,$6,$7,$8) AS id",
      [requestId, input.scope, input.sector, input.dueAt, input.quoteAmount, input.quoteCurrency, input.quoteNote, revisionId])).rows[0].id;
    const hashed = withContentHash(evidence);
    const assignmentIds: string[] = [];
    for (const expertProfileId of input.expertProfileIds) {
      const assignment = (await db.query<{ id: string }>(`INSERT INTO evals.expert_assignment(
          org_id,project_id,assigned_profile_id,kind,severity,guideline_revision_id,review_of_submission_revision_id,due_at
        ) VALUES($1,$2,$3,'authoring',$4,$5,NULL,$6) RETURNING id`,
        [scope.orgId, context.projectId, expertProfileId, severity, revisionId, input.dueAt])).rows[0];
      await db.query("INSERT INTO evals.expert_assignment_evidence(org_id,assignment_id,content_hash,snapshot) VALUES($1,$2,$3,$4)",
        [scope.orgId, assignment.id, hashed.content_hash, evidence]);
      await db.query("INSERT INTO evals.expert_conflict_declaration(org_id,assignment_id,expert_profile_id,status) VALUES($1,$2,$3,'clear')",
        [scope.orgId, assignment.id, expertProfileId]);
      await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'expert_assignment.created',$3)", [scope.orgId, scope.actorId, assignment.id]);
      await db.query("SELECT evals.link_review_order_assignment($1,$2)", [orderId, assignment.id]);
      assignmentIds.push(assignment.id);
    }
    return { orderId, assignmentIds, excerptCount: excerpts.length, guidelineRevisionId: revisionId };
  })).catch(domainError);
}

/**
 * The reviewed revision (P-32): a new immutable revision of the current
 * report labelled "Reviewed by N experts on <date>, scope …", published, with
 * the customer's in-app notice (and email, for members who opted in). N is the
 * number of experts who submitted their own work on the order; the database
 * refuses the label without them (decision I-7). Grades are not changed here:
 * an operator settles any disagreement through the review queue first.
 */
export function publishReviewedRevision(scope: Scope, orderId: string, input: { note: string | null }) {
  return withTenant(scope, async (db) => {
    if (!(await db.query<{ ok: boolean }>("SELECT evals.is_operator() AS ok")).rows[0]?.ok) throw new EvalError("SCOPE_DENIED", 404);
    const order = (await db.query<{ id: string; report_id: string; scope: string; status: string }>(
      "SELECT id,report_id,scope,status FROM evals.review_order WHERE org_id=$1 AND id=$2", [scope.orgId, orderId])).rows[0];
    if (!order) throw new EvalError("SCOPE_DENIED", 404);
    if (order.status !== "open") throw new EvalError("VERSION_CONFLICT", 409, "This order is already closed.");
    const reviewers = Number((await db.query<{ reviewer_count: number }>("SELECT reviewer_count FROM evals.review_order_progress($1)", [orderId])).rows[0]?.reviewer_count ?? 0);
    if (reviewers < 1) throw new EvalError("EXPERT_REVIEW_UNRECORDED", 409, "No expert has submitted work on this order yet.");
    const current = (await db.query<{ id: string; run_id: string; review_status: "preliminary" | "reviewed"; snapshot: unknown }>(
      `SELECT rr.id,rr.run_id,rr.review_status,rr.snapshot FROM evals.report r
       JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(r.org_id,r.current_revision_id)
       WHERE r.org_id=$1 AND r.id=$2 AND r.publication_status='published' FOR UPDATE OF r`, [scope.orgId, order.report_id])).rows[0];
    if (!current) throw new EvalError("REPORT_NOT_READY", 409, "The report has no published revision.");
    const snapshot = reportSnapshotSchema.parse(current.snapshot);
    const { content_hash: _hash, expert_review: _previous, ...rest } = snapshot;
    void _hash; void _previous;
    const revisionId = randomUUID();
    const now = new Date().toISOString();
    const label = { order_id: orderId, reviewer_count: reviewers, reviewed_on: now, scope: order.scope, ...(input.note ? { note: input.note } : {}) };
    const next = buildReportSnapshot({ ...rest, report_revision_id: revisionId, created_at: now, expert_review: label });
    await db.query(`INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status,supersedes_revision_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [revisionId, scope.orgId, order.report_id, current.run_id, next.content_hash, next, current.review_status, current.id]);
    await db.query("UPDATE evals.report SET current_revision_id=$3,publication_status='published',updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, order.report_id, revisionId]);
    const evaluation = (await db.query("SELECT e.id,e.title FROM evals.run r JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id) WHERE r.org_id=$1 AND r.id=$2",
      [scope.orgId, current.run_id])).rows[0];
    // The customer's notice: a report_published notice for the new revision, marked as expert-reviewed (L-07 email for members who opted in).
    await db.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at)
      VALUES($1,$2,'report_published','workspace',$3,'delivered',now()) ON CONFLICT(org_id,event_id,audience) DO NOTHING`,
    [scope.orgId, `report:${order.report_id}:${revisionId}:published`, {
      reportId: order.report_id, revisionId, reviewStatus: current.review_status, supersedes: current.id, expertReviewers: String(reviewers),
      ...(evaluation ? { evaluationId: evaluation.id, evaluationTitle: evaluation.title } : {}),
      pass: snapshot.metrics.n_pass, scored: snapshot.metrics.n_scorable,
    }]);
    const done = (await db.query<{ reviewer_count: number; delivered_at: Date; requested_at: Date }>("SELECT * FROM evals.complete_review_order($1,$2)", [orderId, revisionId])).rows[0];
    return {
      revisionId, reviewerCount: done.reviewer_count, label: expertReviewLabel(label, "en"),
      hoursToReview: Math.round(((new Date(done.delivered_at).getTime() - new Date(done.requested_at).getTime()) / 3_600_000) * 10) / 10,
    };
  }).catch(domainError);
}

/** Ops: cancel an open order (unfinished assignments are canceled; the request is declined). */
export function cancelReviewOrder(scope: Scope, orderId: string, reason: string) {
  return withTenant(scope, async (db) => {
    await db.query("SELECT evals.cancel_review_order($1,$2)", [orderId, reason]);
    return { id: orderId, status: "canceled" as const };
  }).catch(domainError);
}

/* --------------------------------------------------------------- bench --- */

/** Every expert profile with its onboarding checklist and readiness (P-33). */
export function listExpertBench(actorId: string) {
  return withTenant({ orgId: "", actorId }, async (db) => {
    if (!(await db.query<{ ok: boolean }>("SELECT evals.is_operator() AS ok")).rows[0]?.ok) throw new EvalError("SCOPE_DENIED", 404);
    const rows = (await db.query(`SELECT p.id,p.user_id,p.domains,p.languages,p.credentials_status,p.terms_status,p.eligibility_status,
        to_jsonb(o) - 'expert_profile_id' - 'updated_by' AS onboarding,evals.expert_ready(p.id) AS ready
      FROM evals.expert_profile p LEFT JOIN evals.expert_onboarding o ON o.expert_profile_id=p.id
      ORDER BY evals.expert_ready(p.id) DESC,p.created_at DESC,p.id LIMIT 200`)).rows;
    return rows.map((row) => {
      const onboarding = row.onboarding as (Partial<ExpertOnboardingInput> & { trial_agreement?: number | string | null; agreement_threshold?: number | string | null }) | null;
      const normalized = onboarding ? {
        ...onboarding,
        trial_agreement: onboarding.trial_agreement == null ? null : Number(onboarding.trial_agreement),
        agreement_threshold: onboarding.agreement_threshold == null ? 0.8 : Number(onboarding.agreement_threshold),
      } : null;
      const profileMissing = [
        ...(row.credentials_status !== "verified" ? ["profile_credentials"] : []),
        ...(row.terms_status !== "accepted" ? ["profile_terms"] : []),
        ...(row.eligibility_status !== "eligible" ? ["profile_eligibility"] : []),
      ];
      return { ...row, onboarding: normalized, missing: [...profileMissing, ...missingOnboarding(normalized)] };
    });
  });
}

export function saveExpertOnboarding(actorId: string, profileId: string, input: ExpertOnboardingInput) {
  return withTenant({ orgId: "", actorId }, async (db) => ({
    ready: Boolean((await db.query<{ ready: boolean }>("SELECT evals.save_expert_onboarding($1,$2) AS ready", [profileId, input])).rows[0]?.ready),
  })).catch(domainError);
}
