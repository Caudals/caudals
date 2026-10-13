import { randomUUID } from "node:crypto";
import { withTenant } from "../../lib/evals/repositories/db";
import { reportSnapshotSchema } from "../../lib/evals/reports/contracts";
import { buildReadoutDeck } from "../../lib/evals/reports/readout";
import { readoutExportPath, renderReadoutPdf, type ReadoutJobDeck, type ReadoutPdfPage } from "../../lib/evals/reports/readout-pdf";
import { sha256 } from "../../lib/evals/contracts/hashing";
import { objectKey, sealObject } from "../../lib/evals/storage/private";
import { captureServerError } from "../../lib/observability/capture";

/**
 * Readout PDFs (launch L-35): a queued `readout_pdf` export job becomes a
 * 16:9 PDF, one slide per page, from the revision's snapshot and the deck the
 * job recorded (transcript ids and next step). This worker has no grant on
 * presenter notes (migration 099), and the job carries none, so a readout
 * PDF never contains a note.
 */
type Claimed = { id: string; report_revision_id: string; locale: string; readout: ReadoutJobDeck; snapshot: unknown; project_id: string };
export type PageFactory = () => Promise<{ page: ReadoutPdfPage; close: () => Promise<void> }>;

async function claim(orgId: string, actorId: string): Promise<Claimed | undefined> {
  return withTenant({ orgId, actorId }, async (db) => {
    await db.query("UPDATE evals.export_job SET status='queued',reason_code='render_worker_interrupted',updated_at=now() WHERE org_id=$1 AND kind='readout_pdf' AND status='running' AND updated_at<now()-interval '15 minutes'", [orgId]);
    const job = (await db.query(
      `SELECT j.id,j.report_revision_id,j.locale,j.readout,rr.snapshot,r.project_id FROM evals.export_job j
         JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(j.org_id,j.report_revision_id)
         JOIN evals.report r ON (r.org_id,r.id)=(rr.org_id,rr.report_id)
        WHERE j.org_id=$1 AND j.kind='readout_pdf' AND j.status='queued' ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
      [orgId],
    )).rows[0];
    if (!job) return;
    await db.query("UPDATE evals.export_job SET status='running',reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2", [orgId, job.id]);
    return job;
  });
}

/** Renders one queued readout PDF for the workspace; false when there was none. */
export async function processReadoutOne(orgId: string, actorId: string, createPage: PageFactory): Promise<boolean> {
  const job = await claim(orgId, actorId);
  if (!job) return false;
  try {
    const locale = job.locale === "es" ? "es" : "en";
    const snapshot = reportSnapshotSchema.parse(job.snapshot);
    const deck = buildReadoutDeck(snapshot, locale, { transcriptIds: job.readout.transcript_ids, nextStep: job.readout.next_step });
    const bytes = Buffer.from(await renderReadoutPdf(deck, createPage));
    if (bytes.length > 25 * 1024 * 1024) throw new Error("pdf_too_large");
    const artifactId = randomUUID(), key = objectKey(orgId, artifactId, true), hash = sha256(bytes);
    await sealObject(key, bytes, "application/pdf");
    await withTenant({ orgId, actorId }, async (db) => {
      await db.query(
        "INSERT INTO evals.artifact(id,org_id,project_id,export_path,visibility,object_key,sha256,byte_size,media_type,state,expires_at) VALUES($1,$2,$3,$4,'customer',$5,$6,$7,'application/pdf','ready',now()+interval '12 months')",
        [artifactId, orgId, job.project_id, readoutExportPath(job.report_revision_id, locale, job.readout), key, hash, bytes.length],
      );
      await db.query("UPDATE evals.export_job SET status='completed',artifact_id=$3,updated_at=now() WHERE org_id=$1 AND id=$2", [orgId, job.id, artifactId]);
    });
  } catch (error) {
    captureServerError(error, { service: "evals-documents", event: "readout_render_failed", workspace: orgId });
    await withTenant({ orgId, actorId }, (db) => db.query("UPDATE evals.export_job SET status='failed',reason_code='pdf_render_failed',updated_at=now() WHERE org_id=$1 AND id=$2", [orgId, job.id]));
  }
  return true;
}
