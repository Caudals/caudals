import "server-only";
/**
 * Better document intake (launch L-34, P-56): help-centre page previews and
 * imports, and the "What we understood about your assistant" confirmation.
 * Everything here runs under the caller's tenant scope (RLS by org_id).
 */
import type { PoolClient } from "pg";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { getPriceBookAt } from "../../billing/price-book";
import { plansV2For } from "../../billing/overrides";
import { websitePageCap } from "../../billing/plans";
import { ucrToCredits, UCR_PER_CREDIT } from "../../billing/units";
import { contextProfileSchema, type ContextProfile } from "../generation/context";
import { EvalError } from "../domain/errors";
import { normalizePathPrefix } from "../connectors/robots";
import {
  applyContextEdits, CONFIRMATION_REASON, CONFIRMATION_WAIT_MINUTES, contextEditsSchema, contextEvidenceSchema, contextExtension,
  CONTEXT_FIELDS, evidenceKeys, fieldConfidence, LOW_CONFIDENCE, shownBoundaries, type ContextEvidence, type ContextField,
} from "../intake/context";
import { createWebsiteSource, idempotent, type EvidenceScope } from "./evidence";
import { withTenant } from "./db";

/* ---------------------------------------------------------- page caps --- */

/** Pages one website source may read in this workspace: the plan's cap with plans v2, else 50. */
export async function websitePageCapFor(db: PoolClient, orgId: string): Promise<number> {
  const plansV2 = await plansV2For(db, orgId);
  const plan = plansV2 ? (await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [orgId])).rows[0]?.plan ?? null : null;
  return websitePageCap(plan, plansV2);
}

/** Credits per web page read (§6.3) from the price book in effect, 1 when none is. */
async function creditsPerPage(db: PoolClient): Promise<string> {
  try {
    const book = await getPriceBookAt(db);
    const rate = book?.actions.find((action) => action.meter === "web_page_read")?.ucrPerUnit;
    if (rate !== undefined) return ucrToCredits(rate);
  } catch { /* no price book yet */ }
  return ucrToCredits(UCR_PER_CREDIT);
}

/* ---------------------------------------------------- website preview --- */

type PreviewRow = {
  id: string; evaluation_id: string; start_url: string; sitemap_url: string | null; path_prefix: string | null; page_cap: number;
  status: string; discovered_from: string | null; origin: string | null; pages: string[]; found_total: number | null;
  robots_excluded: number | null; outside_prefix: number | null; reason_code: string | null; created_at: Date; updated_at: Date;
};

function previewView(row: PreviewRow, perPage: string, cap: number) {
  return {
    id: row.id, evaluationId: row.evaluation_id, status: row.status, startUrl: row.start_url, sitemapUrl: row.sitemap_url, pathPrefix: row.path_prefix,
    origin: row.origin, discoveredFrom: row.discovered_from, pages: Array.isArray(row.pages) ? row.pages : [],
    foundTotal: row.found_total, robotsExcluded: row.robots_excluded, outsidePrefix: row.outside_prefix, reasonCode: row.reason_code,
    // The plan cap now (it may have grown since the preview was made).
    cap: Math.min(cap, 200),
    estimate: { creditsPerPage: perPage },
    updatedAt: row.updated_at,
  };
}

export function createWebsitePreview(scope: EvidenceScope, input: { evaluationId: string; url: string; sitemapUrl?: string | null; pathPrefix?: string | null }, key: string) {
  return withTenant(scope, (db) => idempotent(db, scope, `website-preview/${input.evaluationId}`, key, { evaluationId: input.evaluationId, url: input.url, sitemapUrl: input.sitemapUrl ?? null, pathPrefix: input.pathPrefix ?? null }, async () => {
    const evaluation = (await db.query("SELECT id FROM evals.evaluation WHERE org_id=$1 AND id=$2", [scope.orgId, input.evaluationId])).rows[0];
    if (!evaluation) throw new EvalError("SCOPE_DENIED", 404);
    let prefix: string | null;
    try { prefix = normalizePathPrefix(input.pathPrefix); } catch { throw new EvalError("INPUT_INVALID", 422, "Use a path such as /help, without a query or spaces."); }
    if (input.sitemapUrl && new URL(input.sitemapUrl).origin !== new URL(input.url).origin) {
      throw new EvalError("INPUT_INVALID", 422, "The sitemap must be on the same website as the help centre.");
    }
    const cap = await websitePageCapFor(db, scope.orgId);
    const row = (await db.query(`INSERT INTO evals.website_page_preview(org_id,evaluation_id,start_url,sitemap_url,path_prefix,page_cap,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status`, [scope.orgId, input.evaluationId, input.url, input.sitemapUrl ?? null, prefix, cap, scope.actorId])).rows[0];
    return { previewId: row.id as string, status: row.status as string, cap };
  }));
}

export function getWebsitePreview(scope: EvidenceScope, previewId: string) {
  return withTenant(scope, async (db) => {
    const row = (await db.query("SELECT * FROM evals.website_page_preview WHERE org_id=$1 AND id=$2", [scope.orgId, previewId])).rows[0] as PreviewRow | undefined;
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    return previewView(row, await creditsPerPage(db), await websitePageCapFor(db, scope.orgId));
  });
}

/**
 * The selected pages of a ready preview become one ordinary website source.
 * Only pages the preview listed can be chosen, and at most the plan's cap.
 */
export function importWebsitePreview(scope: EvidenceScope, input: { evaluationId: string; projectId: string; previewId: string; selectedUrls: string[]; title?: string }, key: string) {
  return withTenant(scope, async (db) => {
    const row = (await db.query("SELECT * FROM evals.website_page_preview WHERE org_id=$1 AND id=$2", [scope.orgId, input.previewId])).rows[0] as PreviewRow | undefined;
    if (!row || row.evaluation_id !== input.evaluationId) throw new EvalError("SCOPE_DENIED", 404);
    if (row.status !== "ready" || !row.origin) throw new EvalError("VERSION_CONFLICT", 409, "The page list is not ready yet.");
    const listed = new Set(Array.isArray(row.pages) ? row.pages : []);
    const selected = [...new Set(input.selectedUrls)];
    if (!selected.length) throw new EvalError("INPUT_INVALID", 422, "Choose at least one page.");
    if (selected.some((url) => !listed.has(url))) throw new EvalError("INPUT_INVALID", 422, "Choose pages from the list.");
    const cap = await websitePageCapFor(db, scope.orgId);
    if (selected.length > cap) throw new EvalError("INPUT_INVALID", 422, `Choose at most ${cap} pages.`);
    const title = input.title?.trim() || `${new URL(row.origin).hostname}${row.path_prefix ?? ""}`;
    return { row, selected, title };
  }).then(({ row, selected, title }) => createWebsiteSource(scope, {
    evaluationId: input.evaluationId, projectId: input.projectId, url: row.start_url, title, rights: "customer_owned",
    import: { previewId: row.id, selectedUrls: selected, sitemapUrl: row.sitemap_url, pathPrefix: row.path_prefix },
  }, key));
}

/* ------------------------------------------------- context confirmation --- */

type ConfirmationRow = {
  id: string; evaluation_id: string; generation_job_id: string; status: "requested" | "pending" | "confirmed" | "skipped";
  base_profile_revision_id: string | null; profile_revision_id: string | null; edited_fields: string[]; evidence: unknown;
  skip_reason: string | null; due_at: Date | null; decided_by: string | null; decided_at: Date | null; requested_by: string;
};

/** A person started this generation with intake v2: generation will wait for "What we understood". */
export async function requestContextConfirmation(db: PoolClient, scope: EvidenceScope, evaluationId: string, jobId: string) {
  await db.query("INSERT INTO evals.context_confirmation(org_id,evaluation_id,generation_job_id,status,requested_by) VALUES($1,$2,$3,'requested',$4) ON CONFLICT (org_id,generation_job_id) DO NOTHING",
    [scope.orgId, evaluationId, jobId, scope.actorId]);
}

/**
 * Called with the profile generation is about to draft from. Without a
 * request, or once decided, generation continues (null). A request turns into
 * a pending confirmation and generation waits on the screen (needs_input with
 * the confirmation reason; notified like any required input).
 */
export async function contextConfirmationGate(db: PoolClient, scope: EvidenceScope, evaluationId: string, jobId: string, profileRevisionId: string, evidence: () => Promise<ContextEvidence>) {
  const row = (await db.query("SELECT * FROM evals.context_confirmation WHERE org_id=$1 AND generation_job_id=$2 FOR UPDATE", [scope.orgId, jobId])).rows[0] as ConfirmationRow | undefined;
  if (!row || row.status === "confirmed" || row.status === "skipped") return null;
  if (row.status === "requested") {
    let found: ContextEvidence = { basis: {}, inferred: {} };
    try { found = await evidence(); } catch { /* the screen still shows the profile, without excerpts */ }
    await db.query(`UPDATE evals.context_confirmation SET status='pending',base_profile_revision_id=$3,evidence=$4::jsonb,due_at=now()+make_interval(mins=>$5),updated_at=now()
      WHERE org_id=$1 AND id=$2`, [scope.orgId, row.id, profileRevisionId, JSON.stringify(found), CONFIRMATION_WAIT_MINUTES]);
  }
  await db.query("UPDATE evals.generation_job SET status='needs_input',profile_revision_id=$3,reason_code=$4,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, jobId, row.base_profile_revision_id ?? profileRevisionId, CONFIRMATION_REASON]);
  await db.query("UPDATE evals.evaluation SET preparation_status='needs_input',reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, evaluationId, CONFIRMATION_REASON]);
  return { status: "needs_input" as const, jobId, reasonCode: CONFIRMATION_REASON, confirmationId: row.id };
}

async function decide(db: PoolClient, scope: EvidenceScope, row: ConfirmationRow, decision: { kind: "confirm"; edits: unknown } | { kind: "skip"; reason: "person" | "timeout" }) {
  const base = (await db.query("SELECT document,model_revision_id,prompt_revision FROM evals.context_profile_revision WHERE org_id=$1 AND id=$2", [scope.orgId, row.base_profile_revision_id])).rows[0];
  if (!base) throw new EvalError("GENERATION_INVALID", 409, "The saved context profile is unavailable.");
  let profileRevisionId = row.base_profile_revision_id!;
  let editedFields: ContextField[] = [];
  if (decision.kind === "confirm") {
    const edits = contextEditsSchema.parse(decision.edits ?? {});
    let applied;
    try { applied = applyContextEdits(contextProfileSchema.parse(base.document), edits, { confirmationId: row.id, evidence: contextEvidenceSchema.parse(row.evidence) }); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new EvalError("INPUT_INVALID", 422, message === "context_answer_invalid_date" ? "Enter the reference date as a date such as 2026-10-01."
        : message.startsWith("context_language") || message === "context_answer_invalid_language" ? "Enter languages such as English, Spanish or es-ES."
        : message === "context_source_unknown" ? "Choose one of this test set's sources." : "Check the corrected fields and try again.");
    }
    editedFields = applied.editedFields;
    profileRevisionId = (await db.query("INSERT INTO evals.context_profile_revision(org_id,evaluation_id,content_hash,document,model_revision_id,prompt_revision) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [scope.orgId, row.evaluation_id, applied.profile.content_hash, applied.profile, base.model_revision_id, base.prompt_revision])).rows[0].id;
    await db.query("UPDATE evals.context_confirmation SET status='confirmed',profile_revision_id=$3,edited_fields=$4,decided_by=$5,decided_at=now(),updated_at=now() WHERE org_id=$1 AND id=$2",
      [scope.orgId, row.id, profileRevisionId, editedFields, scope.actorId]);
  } else {
    await db.query("UPDATE evals.context_confirmation SET status='skipped',profile_revision_id=$3,skip_reason=$4,decided_by=$5,decided_at=now(),updated_at=now() WHERE org_id=$1 AND id=$2",
      [scope.orgId, row.id, profileRevisionId, decision.reason, decision.reason === "person" ? scope.actorId : null]);
  }
  await db.query("UPDATE evals.generation_job SET status='profile_ready',profile_revision_id=$3,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='needs_input' AND reason_code=$4",
    [scope.orgId, row.generation_job_id, profileRevisionId, CONFIRMATION_REASON]);
  await db.query("UPDATE evals.evaluation SET preparation_status='generating',reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2 AND reason_code=$3", [scope.orgId, row.evaluation_id, CONFIRMATION_REASON]);
  await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,$3,$4,$5)", [scope.orgId, scope.actorId,
    decision.kind === "confirm" ? "context.confirmed" : "context.skipped", row.generation_job_id,
    { evaluationId: row.evaluation_id, confirmationId: row.id, profileRevisionId, baseProfileRevisionId: row.base_profile_revision_id, editedFields, ...(decision.kind === "skip" ? { reason: decision.reason } : {}) }]);
  if (decision.kind === "confirm") await recordProductEvent({ eventName: "context_confirmed", source: "server", orgId: scope.orgId, eventKey: `confirmation:${row.id}`, payload: { count: editedFields.length, edited_fields: editedFields.join("/") } }, db);
  return { status: "profile_ready" as const, jobId: row.generation_job_id, profileRevisionId, editedFields, decision: decision.kind === "confirm" ? "confirmed" as const : "skipped" as const };
}

/** Confirm (with corrections) or skip, once. Confirming and editing are free (§6.3). */
export function decideContextConfirmation(scope: EvidenceScope, evaluationId: string, input: { jobId: string; decision: "confirm" | "skip"; edits?: unknown }, key: string) {
  return withTenant(scope, (db) => idempotent(db, scope, `context-confirmation/${input.jobId}`, key, { evaluationId, ...input, edits: input.edits ?? null }, async () => {
    await db.query("SELECT id FROM evals.evaluation WHERE org_id=$1 AND id=$2 FOR UPDATE", [scope.orgId, evaluationId]);
    const job = (await db.query("SELECT id,status,reason_code,control_state FROM evals.generation_job WHERE org_id=$1 AND evaluation_id=$2 AND id=$3 FOR UPDATE", [scope.orgId, evaluationId, input.jobId])).rows[0];
    if (!job) throw new EvalError("SCOPE_DENIED", 404);
    const latest = (await db.query("SELECT id FROM evals.generation_job WHERE org_id=$1 AND evaluation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1", [scope.orgId, evaluationId])).rows[0];
    if (latest?.id !== job.id) throw new EvalError("VERSION_CONFLICT", 409, "A newer preparation has replaced this one.");
    const row = (await db.query("SELECT * FROM evals.context_confirmation WHERE org_id=$1 AND generation_job_id=$2 FOR UPDATE", [scope.orgId, input.jobId])).rows[0] as ConfirmationRow | undefined;
    if (!row || row.status !== "pending" || job.status !== "needs_input" || job.reason_code !== CONFIRMATION_REASON || job.control_state !== "active") {
      throw new EvalError("VERSION_CONFLICT", 409, "This context has already been confirmed or skipped.");
    }
    return decide(db, scope, row, input.decision === "confirm" ? { kind: "confirm", edits: input.edits } : { kind: "skip", reason: "person" });
  }));
}

/** Generation waits at most CONFIRMATION_WAIT_MINUTES, then continues with the inferred profile (the scheduler). */
export async function expireContextConfirmations(scope: EvidenceScope) {
  return withTenant(scope, async (db) => {
    const rows = (await db.query(`SELECT c.* FROM evals.context_confirmation c JOIN evals.generation_job g ON (g.org_id,g.id)=(c.org_id,c.generation_job_id)
      WHERE c.org_id=$1 AND c.status='pending' AND c.due_at<now() AND g.control_state='active' AND g.status='needs_input' AND g.reason_code=$2
      ORDER BY c.due_at LIMIT 10 FOR UPDATE OF c SKIP LOCKED`, [scope.orgId, CONFIRMATION_REASON])).rows as ConfirmationRow[];
    for (const row of rows) await decide(db, scope, row, { kind: "skip", reason: "timeout" });
    return rows.length;
  });
}

/** The context profile behind a generation, for every test it writes (case extension). */
export async function contextExtensionFor(db: PoolClient, orgId: string, jobId: string, profileRevisionId: string) {
  const row = (await db.query("SELECT id,status,skip_reason FROM evals.context_confirmation WHERE org_id=$1 AND generation_job_id=$2", [orgId, jobId])).rows[0] as { id: string; status: string; skip_reason: string | null } | undefined;
  if (!row || (row.status !== "confirmed" && row.status !== "skipped")) return null;
  return contextExtension({ profileRevisionId, confirmationId: row.id, status: row.status as "confirmed" | "skipped", skipReason: row.skip_reason });
}

/* --------------------------------------------------------- the screen --- */

type Excerpt = { sourceTitle: string; text: string };

/** "What we understood about your assistant", in plain words, with the evidence one click away. */
export function getContextConfirmation(scope: EvidenceScope, evaluationId: string, jobId?: string | null) {
  return withTenant(scope, async (db) => {
    const row = (await db.query(`SELECT * FROM evals.context_confirmation WHERE org_id=$1 AND evaluation_id=$2 AND ($3::uuid IS NULL OR generation_job_id=$3)
      ORDER BY created_at DESC,id DESC LIMIT 1`, [scope.orgId, evaluationId, jobId ?? null])).rows[0] as ConfirmationRow | undefined;
    if (!row) return { confirmation: null, context: null };
    const revisionId = row.profile_revision_id ?? row.base_profile_revision_id;
    const confirmation = {
      id: row.id, jobId: row.generation_job_id, status: row.status, dueAt: row.due_at, decidedAt: row.decided_at,
      decidedByMe: !!row.decided_by && row.decided_by === scope.actorId, editedFields: row.edited_fields ?? [], skipReason: row.skip_reason,
    };
    if (!revisionId) return { confirmation, context: null };
    const saved = (await db.query("SELECT document FROM evals.context_profile_revision WHERE org_id=$1 AND id=$2", [scope.orgId, revisionId])).rows[0];
    if (!saved) return { confirmation, context: null };
    const profile: ContextProfile = contextProfileSchema.parse(saved.document);
    const evidence = contextEvidenceSchema.parse(row.evidence);
    const sourceRows = (await db.query(`SELECT sr.id,s.title FROM evals.source_revision sr JOIN evals.source s ON (s.org_id,s.id)=(sr.org_id,sr.source_id)
      WHERE sr.org_id=$1 AND sr.id=ANY($2::uuid[])`, [scope.orgId, profile.source_hierarchy.map((entry) => entry.source_revision_id)])).rows as Array<{ id: string; title: string }>;
    const titles = new Map(sourceRows.map((source) => [source.id, source.title]));
    // Excerpts the analyst cited, at most two a field.
    const keys = new Map<ContextField, string[]>(CONTEXT_FIELDS.map((field) => [field, evidenceKeys(evidence, profile, field).slice(0, 2)]));
    const anchorIds = [...keys.values()].flat().map((key) => key.split(":")[1]).filter((id): id is string => !!id && /^[0-9a-f-]{36}$/i.test(id));
    const chunks = anchorIds.length ? (await db.query("SELECT id,source_revision_id,excerpt FROM evals.source_chunk WHERE org_id=$1 AND id=ANY($2::uuid[])", [scope.orgId, anchorIds])).rows as Array<{ id: string; source_revision_id: string; excerpt: string }> : [];
    const byAnchor = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const description = keys.get("purpose")?.includes("project_description")
      ? (await db.query("SELECT p.description FROM evals.evaluation e JOIN evals.project p ON (p.org_id,p.id)=(e.org_id,e.project_id) WHERE e.org_id=$1 AND e.id=$2", [scope.orgId, evaluationId])).rows[0]?.description as string | undefined
      : undefined;
    const excerptsFor = (field: ContextField): Excerpt[] => (keys.get(field) ?? []).flatMap((key): Excerpt[] => {
      if (key === "project_description") return description ? [{ sourceTitle: "project_description", text: description.slice(0, 600) }] : [];
      if (key === "detected_from_sources") return [{ sourceTitle: "detected_from_sources", text: "" }];
      const chunk = byAnchor.get(key.split(":")[1] ?? "");
      return chunk ? [{ sourceTitle: titles.get(chunk.source_revision_id) ?? "", text: chunk.excerpt.replace(/\s+/g, " ").trim().slice(0, 600) }] : [];
    });
    const field = (name: ContextField) => {
      const confidence = fieldConfidence(profile, name);
      return { confidence, low: confidence < LOW_CONFIDENCE, excerpts: excerptsFor(name) };
    };
    return {
      confirmation,
      context: {
        profileRevisionId: revisionId,
        purpose: { value: profile.purpose.value, ...field("purpose") },
        intendedUsers: { values: profile.intended_users, ...field("intended_users") },
        tasks: { values: profile.tasks, ...field("tasks") },
        languages: { values: profile.languages, ...field("languages") },
        jurisdiction: { value: profile.jurisdiction.value, ...field("jurisdiction") },
        asOf: { value: profile.as_of ? profile.as_of.slice(0, 10) : null, ...field("as_of") },
        boundaries: { values: shownBoundaries(profile, evidence), ...field("business_boundaries") },
        sources: profile.source_hierarchy.map((entry) => ({ revisionId: entry.source_revision_id, title: titles.get(entry.source_revision_id) ?? "", rank: entry.rank })),
        conflicts: profile.conflicts.map((conflict) => ({ field: conflict.field, values: conflict.values, sources: [...new Set(conflict.source_revision_ids.map((id) => titles.get(id) ?? ""))] })),
        openQuestions: profile.unanswered_questions.map((question) => ({ field: question.field, question: question.question, critical: question.critical })),
      },
    };
  });
}
