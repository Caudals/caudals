import "server-only";
import { EvalError } from "../domain/errors";
import { reportSnapshotSchema, type ReportSnapshot } from "../reports/contracts";
import { READOUT_MAX_TRANSCRIPTS, READOUT_NOTE_KEY, READOUT_NOTE_MAX, buildReadoutDeck, defaultNextStep, resolveTranscriptIds, type ReadoutNextStep } from "../reports/readout";
import { readoutExportPath } from "../reports/readout-pdf";
import type { EvidenceScope } from "./evidence";
import { withTenant } from "./db";
import type { PoolClient } from "pg";

/**
 * Readout decks and presenter notes (launch L-35, migration 099). Decks
 * (transcript picks, next step) are read by every presenter; notes only by
 * operators: callers pass `notes: true` only for them, and row-level security
 * returns no note to anyone else whatever the caller asks.
 */
export type ReadoutState = {
  revision: { id: string; report_id: string; created_at: string; review_status: string; snapshot: ReportSnapshot };
  plan: string | null;
  deck: { transcriptIds: string[] | null; nextStep: ReadoutNextStep | null; updatedAt: string | null };
  notes?: Record<string, string>;
};

async function revisionRow(db: PoolClient, orgId: string, reportId: string, revisionId: string | null) {
  const row = (await db.query(
    `SELECT rr.id,rr.report_id,rr.created_at,rr.review_status,rr.snapshot FROM evals.report r
       JOIN evals.report_revision rr ON rr.org_id=r.org_id AND rr.report_id=r.id AND rr.id=COALESCE($3::uuid,r.current_revision_id,(SELECT x.id FROM evals.report_revision x WHERE x.org_id=r.org_id AND x.report_id=r.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1))
      WHERE r.org_id=$1 AND r.id=$2 AND r.archived_at IS NULL`,
    [orgId, reportId, revisionId],
  )).rows[0];
  if (!row) throw new EvalError("SCOPE_DENIED", 404);
  return { ...row, snapshot: reportSnapshotSchema.parse(row.snapshot) } as ReadoutState["revision"];
}

export function getReadout(scope: EvidenceScope, reportId: string, revisionId: string | null, options: { notes: boolean }): Promise<ReadoutState> {
  return withTenant(scope, async (db) => {
    const revision = await revisionRow(db, scope.orgId, reportId, revisionId);
    const plan = (await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [scope.orgId])).rows[0]?.plan ?? null;
    const deck = (await db.query("SELECT transcript_ids,next_step,updated_at FROM evals.readout_deck WHERE org_id=$1 AND report_revision_id=$2", [scope.orgId, revision.id])).rows[0];
    const state: ReadoutState = { revision, plan, deck: { transcriptIds: deck?.transcript_ids ?? null, nextStep: deck?.next_step ?? null, updatedAt: deck?.updated_at ?? null } };
    if (options.notes) {
      const rows = (await db.query("SELECT slide_key,body FROM evals.readout_note WHERE org_id=$1 AND report_revision_id=$2 ORDER BY slide_key", [scope.orgId, revision.id])).rows;
      state.notes = Object.fromEntries(rows.map((row) => [row.slide_key, row.body]));
    }
    return state;
  });
}

export type ReadoutUpdate = {
  /** Undefined leaves the picks unchanged; null goes back to the default. */
  transcriptIds?: string[] | null;
  nextStep?: ReadoutNextStep | null;
  /** Slide key → note; null removes the note (the slide shows the script again). */
  notes?: Record<string, string | null>;
};

function checkTranscripts(snapshot: ReportSnapshot, ids: readonly string[]) {
  const known = new Set(snapshot.results.map((item) => item.assessment_id));
  if (!ids.length || ids.length > READOUT_MAX_TRANSCRIPTS || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw new EvalError("INPUT_INVALID", 422, `Choose between 1 and ${READOUT_MAX_TRANSCRIPTS} different results of this report revision.`);
  }
}
function checkNotes(snapshot: ReportSnapshot, notes: Record<string, string | null>) {
  const known = new Set(snapshot.results.map((item) => `transcript:${item.assessment_id}`));
  for (const [key, body] of Object.entries(notes)) {
    if (!READOUT_NOTE_KEY.test(key) || (key.startsWith("transcript:") && !known.has(key))) throw new EvalError("INPUT_INVALID", 422, "A note names a slide that is not in this readout.");
    if (body != null && body.length > READOUT_NOTE_MAX) throw new EvalError("INPUT_INVALID", 422, `Keep each note under ${READOUT_NOTE_MAX.toLocaleString("en")} characters.`);
  }
}

/** Saves an operator's picks, next step and notes for one revision, with the actor and an audit event. */
export function saveReadout(scope: EvidenceScope, reportId: string, revisionId: string, update: ReadoutUpdate): Promise<ReadoutState> {
  return withTenant(scope, async (db) => {
    const revision = await revisionRow(db, scope.orgId, reportId, revisionId);
    if (update.transcriptIds) checkTranscripts(revision.snapshot, update.transcriptIds);
    if (update.notes) checkNotes(revision.snapshot, update.notes);
    if (update.transcriptIds !== undefined || update.nextStep !== undefined) {
      await db.query(
        `INSERT INTO evals.readout_deck(org_id,report_revision_id,transcript_ids,next_step) VALUES($1,$2,$3::jsonb,$4)
         ON CONFLICT(org_id,report_revision_id) DO UPDATE SET
           transcript_ids=CASE WHEN $5 THEN EXCLUDED.transcript_ids ELSE evals.readout_deck.transcript_ids END,
           next_step=CASE WHEN $6 THEN EXCLUDED.next_step ELSE evals.readout_deck.next_step END,
           updated_by=evals.actor_id(),updated_at=now()`,
        [scope.orgId, revision.id, update.transcriptIds ? JSON.stringify(update.transcriptIds) : null, update.nextStep ?? null, update.transcriptIds !== undefined, update.nextStep !== undefined],
      );
    }
    for (const [key, body] of Object.entries(update.notes ?? {})) {
      if (body == null) await db.query("DELETE FROM evals.readout_note WHERE org_id=$1 AND report_revision_id=$2 AND slide_key=$3", [scope.orgId, revision.id, key]);
      else await db.query(
        `INSERT INTO evals.readout_note(org_id,report_revision_id,slide_key,body) VALUES($1,$2,$3,$4)
         ON CONFLICT(org_id,report_revision_id,slide_key) DO UPDATE SET body=EXCLUDED.body,updated_by=evals.actor_id(),updated_at=now()`,
        [scope.orgId, revision.id, key, body],
      );
    }
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'readout.saved',$3)", [scope.orgId, scope.actorId, revision.id]);
    const deck = (await db.query("SELECT transcript_ids,next_step,updated_at FROM evals.readout_deck WHERE org_id=$1 AND report_revision_id=$2", [scope.orgId, revision.id])).rows[0];
    const notes = (await db.query("SELECT slide_key,body FROM evals.readout_note WHERE org_id=$1 AND report_revision_id=$2 ORDER BY slide_key", [scope.orgId, revision.id])).rows;
    return {
      revision,
      plan: (await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [scope.orgId])).rows[0]?.plan ?? null,
      deck: { transcriptIds: deck?.transcript_ids ?? null, nextStep: deck?.next_step ?? null, updatedAt: deck?.updated_at ?? null },
      notes: Object.fromEntries(notes.map((row) => [row.slide_key, row.body])),
    };
  });
}

/**
 * Queues the 16:9 readout PDF for the document worker, or returns the job
 * already queued or done for the same revision, language and deck. The job
 * records the transcript ids and next step it renders, never a note.
 */
export function queueReadoutExport(scope: EvidenceScope, reportId: string, revisionId: string, locale: "en" | "es", choice: { transcriptIds?: string[] | null; nextStep?: ReadoutNextStep | null }) {
  return withTenant(scope, async (db) => {
    const revision = await revisionRow(db, scope.orgId, reportId, revisionId);
    if (choice.transcriptIds?.length) checkTranscripts(revision.snapshot, choice.transcriptIds);
    // What the presenter shows; anything left out comes from the saved deck, then the defaults.
    const saved = (await db.query("SELECT transcript_ids,next_step FROM evals.readout_deck WHERE org_id=$1 AND report_revision_id=$2", [scope.orgId, revision.id])).rows[0];
    const plan = (await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [scope.orgId])).rows[0]?.plan ?? null;
    const readout = {
      transcript_ids: resolveTranscriptIds(revision.snapshot.results, choice.transcriptIds?.length ? choice.transcriptIds : saved?.transcript_ids),
      next_step: (choice.nextStep ?? saved?.next_step ?? defaultNextStep(plan)) as ReadoutNextStep,
    };
    const slideCount = buildReadoutDeck(revision.snapshot, locale, { transcriptIds: readout.transcript_ids, nextStep: readout.next_step }).slides.length;
    const existing = (await db.query(
      `SELECT j.id,j.status,j.artifact_id FROM evals.export_job j LEFT JOIN evals.artifact a ON (a.org_id,a.id)=(j.org_id,j.artifact_id)
        WHERE j.org_id=$1 AND j.report_revision_id=$2 AND j.kind='readout_pdf' AND j.locale=$3 AND j.readout=$4::jsonb
          AND (j.status IN ('queued','running') OR (j.status='completed' AND a.state='ready' AND a.expires_at>now() AND a.export_path=$5))
        ORDER BY j.created_at DESC LIMIT 1`,
      [scope.orgId, revision.id, locale, JSON.stringify(readout), readoutExportPath(revision.id, locale, readout)],
    )).rows[0];
    if (existing) return { job: existing as { id: string; status: string; artifact_id: string | null }, created: false, slideCount };
    const job = (await db.query("INSERT INTO evals.export_job(org_id,report_revision_id,kind,locale,readout) VALUES($1,$2,'readout_pdf',$3,$4::jsonb) RETURNING id,status,artifact_id", [scope.orgId, revision.id, locale, JSON.stringify(readout)])).rows[0];
    return { job: job as { id: string; status: string; artifact_id: string | null }, created: true, slideCount };
  });
}
