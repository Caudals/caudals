import "server-only";
import { z } from "zod";
import { EvalError } from "../domain/errors";
import type { EvidenceScope } from "../repositories/evidence";
import { withTenant } from "../repositories/db";
import type { PoolClient } from "pg";
import { scrubShareLinks } from "../prospects/policy";

export function handoffSummary(input:{reportId:string;reportRevisionId:string;title:string;metrics:Record<string,unknown>;
  findings:Array<{title:string;severity:string}>}){
  return {status:"draft_for_operator_review",report_id:input.reportId,report_revision_id:input.reportRevisionId,
    title:input.title.slice(0,160),planned_count:Number(input.metrics.n_planned??0),
    assessed_count:Number(input.metrics.n_scorable??0),
    findings:input.findings.slice(0,3).map(item=>({title:item.title.slice(0,160),severity:item.severity}))};
}
export function createCrmHandoffDraft(tenant:EvidenceScope,reportRevisionId:string){
  z.uuid().parse(reportRevisionId);
  return withTenant(tenant,async db=>{
    const row=(await db.query(`SELECT rr.id,r.id AS report_id,r.title,rr.snapshot FROM evals.report_revision rr
      JOIN evals.report r ON (r.org_id,r.id)=(rr.org_id,rr.report_id)
      WHERE rr.org_id=$1 AND rr.id=$2 AND rr.review_status='reviewed'
      AND r.current_revision_id=rr.id AND r.publication_status='published'`,[tenant.orgId,reportRevisionId])).rows[0];
    if(!row)throw new EvalError("SCOPE_DENIED",404,"Use a reviewed, published report revision.");
    const snapshot=row.snapshot as {metrics?:Record<string,unknown>;findings?:Array<{title:string;severity:string}>};
    const summary=handoffSummary({reportId:row.report_id,reportRevisionId,title:row.title,
      metrics:snapshot.metrics??{},findings:snapshot.findings??[]});
    const draft=(await db.query(`INSERT INTO evals.crm_handoff_draft(org_id,report_revision_id,summary)
      VALUES($1,$2,$3) ON CONFLICT(org_id,report_revision_id) DO NOTHING RETURNING id,summary,created_at`,
      [tenant.orgId,reportRevisionId,summary])).rows[0];
    return draft??(await db.query("SELECT id,summary,created_at FROM evals.crm_handoff_draft WHERE org_id=$1 AND report_revision_id=$2",
      [tenant.orgId,reportRevisionId])).rows[0];
  });
}
export function listCrmHandoffDrafts(tenant:EvidenceScope){return withTenant(tenant,async db=>(await db.query(`SELECT id,report_revision_id,summary,created_by,created_at
  FROM evals.crm_handoff_draft WHERE org_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[tenant.orgId])).rows);}

/* ------------------------------------------------ launch L-21 handoffs --- */
// "Create CRM draft" (spec v2 P-34, P-35): an explicit operator click writes an
// immutable handoff draft for Warmbly, the CRM of record. Nothing is sent, no
// contact is enrolled and no campaign changes: the operator copies the draft
// into Warmbly, where campaigns stay drafts until the founder authorises them.

type DraftRow = { id: string; summary: Record<string, unknown>; created_at: Date };

async function insertDraft(db: PoolClient, orgId: string, reportRevisionId: string, summary: Record<string, unknown>) {
  const draft = (await db.query(`INSERT INTO evals.crm_handoff_draft(org_id,report_revision_id,summary)
    VALUES($1,$2,$3) ON CONFLICT(org_id,report_revision_id) DO NOTHING RETURNING id,summary,created_at`, [orgId, reportRevisionId, summary])).rows[0] as DraftRow | undefined;
  if (draft) await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,evals.actor_id(),'crm_handoff_draft.created',$2)", [orgId, draft.id]);
  return { created: !!draft, draft: draft ?? (await db.query("SELECT id,summary,created_at FROM evals.crm_handoff_draft WHERE org_id=$1 AND report_revision_id=$2",
    [orgId, reportRevisionId])).rows[0] as DraftRow };
}

const outreachSchema = z.strictObject({
  locale: z.enum(["en", "es"]),
  linkedin: z.string().trim().min(1).max(3000),
  emailSubject: z.string().trim().min(1).max(200),
  emailBody: z.string().trim().min(1).max(4000),
});
export type SnapshotOutreach = z.infer<typeof outreachSchema>;

/** A Warmbly handoff draft for a shared prospect snapshot, with the operator's edited outreach (without the link token). */
export async function createSnapshotCrmDraft(actorId: string, snapshotId: string, outreach: SnapshotOutreach) {
  z.uuid().parse(snapshotId);
  const text = outreachSchema.parse(outreach);
  const snapshot = await withTenant({ orgId: "", actorId }, async db => (await db.query(
    "SELECT id,org_id,company,target_host,help_host,testing_basis,locale,share_id,share_expires_at FROM evals.prospect_snapshot WHERE id=$1", [snapshotId])).rows[0]);
  if (!snapshot) throw new EvalError("SCOPE_DENIED", 404);
  if (!snapshot.share_id) throw new EvalError("SHARE_REQUIRED", 409, "Create the private link before the CRM draft.");
  return withTenant({ orgId: snapshot.org_id, actorId }, async db => {
    const row = (await db.query(`SELECT rr.id,r.id AS report_id,r.title,rr.snapshot,rr.review_status FROM evals.share_grant g
      JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(g.org_id,g.report_revision_id) JOIN evals.report r ON (r.org_id,r.id)=(rr.org_id,rr.report_id)
      WHERE g.org_id=$1 AND g.id=$2 AND g.revoked_at IS NULL`, [snapshot.org_id, snapshot.share_id])).rows[0];
    if (!row) throw new EvalError("SHARE_REQUIRED", 409, "Create the private link before the CRM draft.");
    const report = row.snapshot as { metrics?: Record<string, unknown>; findings?: Array<{ title: string; severity: string }> };
    const summary = {
      ...handoffSummary({ reportId: row.report_id, reportRevisionId: row.id, title: row.title, metrics: report.metrics ?? {}, findings: report.findings ?? [] }),
      kind: "external_snapshot", destination: "warmbly", sent: false, review_status: row.review_status,
      company: String(snapshot.company).slice(0, 120), website: `https://${snapshot.target_host}`, help_centre_host: snapshot.help_host,
      testing_basis: snapshot.testing_basis, share: { label: "external_snapshot", expires_at: snapshot.share_expires_at },
      tags: ["caudals-snapshot", `lang-${text.locale}`],
      outreach: { locale: text.locale, channel_order: ["linkedin", "email_with_documented_basis"], linkedin: scrubShareLinks(text.linkedin),
        email_subject: scrubShareLinks(text.emailSubject), email_body: scrubShareLinks(text.emailBody) },
    };
    const result = await insertDraft(db, snapshot.org_id, row.id, summary);
    await db.query("UPDATE evals.prospect_snapshot SET crm_draft_id=$2,updated_at=now() WHERE id=$1 AND crm_draft_id IS DISTINCT FROM $2", [snapshot.id, result.draft.id]);
    return { ...result.draft, created: result.created };
  });
}

/** A Warmbly handoff draft for a growth-pipeline account, from its latest published report. */
export async function createAccountCrmDraft(tenant: EvidenceScope) {
  return withTenant(tenant, async db => {
    const row = (await db.query(`SELECT rr.id,r.id AS report_id,r.title,rr.snapshot,rr.review_status,w.name AS company FROM evals.report r
      JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(r.org_id,r.current_revision_id) JOIN evals.workspace w ON w.id=r.org_id
      WHERE r.org_id=$1 AND r.publication_status='published' AND r.archived_at IS NULL ORDER BY r.updated_at DESC,r.id DESC LIMIT 1`, [tenant.orgId])).rows[0];
    if (!row) throw new EvalError("REPORT_NOT_READY", 409, "This account has no published report yet.");
    const report = row.snapshot as { metrics?: Record<string, unknown>; findings?: Array<{ title: string; severity: string }> };
    const summary = {
      ...handoffSummary({ reportId: row.report_id, reportRevisionId: row.id, title: row.title, metrics: report.metrics ?? {}, findings: report.findings ?? [] }),
      kind: "account", destination: "warmbly", sent: false, review_status: row.review_status,
      company: String(row.company).slice(0, 160), workspace_id: tenant.orgId, tags: ["caudals-account"],
    };
    const result = await insertDraft(db, tenant.orgId, row.id, summary);
    return { ...result.draft, created: result.created };
  });
}
