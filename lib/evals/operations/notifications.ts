import "server-only";
import { withTenant } from "../repositories/db";

// Opt-in email for meaningful evaluation state changes (spec §15.5). In-app
// notices are written by the workflows themselves; this module mails each
// notice at most once per opted-in member, with a link and no evaluation
// content. It never emails companies being evaluated or outreach lists.

export type EmailMessage = { to: string; subject: string; text: string };
export type SendEmail = (message: EmailMessage) => Promise<{ id: string | null }>;
type Scope = { orgId: string; actorId: string };

const appUrl = () => (process.env.EVALS_APP_URL ?? "https://app.caudals.com").replace(/\/$/, "");

export async function resendSender(): Promise<SendEmail> {
  const { getResendClient } = await import("@/lib/resend/client");
  const { getSecretEnvValue } = await import("@/lib/env/secrets");
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("RESEND_FROM_EMAIL is not configured");
  const client = getResendClient();
  return async (message) => {
    const result = await client.emails.send({ from, to: message.to, subject: message.subject, text: message.text });
    if (result.error) throw new Error("email_provider_rejected");
    return { id: result.data?.id ?? null };
  };
}

/** One in-app notice per evaluation that is waiting on a customer answer. */
export function queueRequiredInputNotifications(scope: Scope) {
  return withTenant(scope, async (db) => (await db.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at)
    SELECT org_id,'evaluation:'||id||':needs_input:'||COALESCE(reason_code,'context'),'input_required','workspace',jsonb_build_object('evaluationId',id),'delivered',now()
    FROM evals.evaluation WHERE org_id=$1 AND preparation_status='needs_input'
    ON CONFLICT (org_id,event_id,audience) DO NOTHING`, [scope.orgId])).rowCount ?? 0);
}

function compose(kind: string, payload: Record<string, string>, orgId: string): { subject: string; text: string } {
  const link = kind === "report_published" && payload.reportId
    ? `${appUrl()}/workspace/reports/${payload.reportId}?orgId=${orgId}`
    : payload.evaluationId ? `${appUrl()}/workspace/evaluations/${payload.evaluationId}?orgId=${orgId}` : `${appUrl()}/workspace/evaluations`;
  const body = kind === "report_published"
    ? { subject: "Your Caudals evaluation results are ready", line: "An evaluation report is ready in your workspace. Its review status is shown with the results." }
    : kind === "run_failed"
      ? { subject: "A Caudals evaluation could not complete", line: "An evaluation stopped without a usable result. Completed work is preserved; open the workspace for next steps." }
      : { subject: "Caudals needs one answer to continue", line: "An evaluation is waiting for a short answer about its scope before it can continue." };
  return { subject: body.subject, text: `${body.line}\n\nOpen it here: ${link}\n\nYou receive this because email notifications are on in your workspace settings.` };
}

export async function deliverEmailNotifications(scope: Scope, send: SendEmail) {
  const pending = await withTenant(scope, async (db) => {
    const notices = (await db.query(`SELECT id,kind,payload FROM evals.notification WHERE org_id=$1 AND created_at>now()-interval '3 days'
      AND kind IN ('report_published','run_failed','input_required') ORDER BY created_at LIMIT 50`, [scope.orgId])).rows;
    const out: Array<{ id: string; notificationId: string; email: string; kind: string; payload: Record<string, string> }> = [];
    for (const notice of notices) {
      const recipients = (await db.query("SELECT * FROM evals.notification_email_recipients($1,$2)", [scope.orgId, notice.kind])).rows;
      for (const recipient of recipients) {
        await db.query("INSERT INTO evals.notification_email(org_id,notification_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [scope.orgId, notice.id, recipient.user_id]);
        const row = (await db.query("SELECT id FROM evals.notification_email WHERE org_id=$1 AND notification_id=$2 AND user_id=$3 AND status='queued' AND attempts<3 FOR UPDATE SKIP LOCKED",
          [scope.orgId, notice.id, recipient.user_id])).rows[0];
        if (row) {
          await db.query("UPDATE evals.notification_email SET attempts=attempts+1 WHERE org_id=$1 AND id=$2", [scope.orgId, row.id]);
          out.push({ id: row.id, notificationId: notice.id, email: recipient.email, kind: notice.kind, payload: notice.payload });
        }
      }
    }
    return out;
  });
  let sent = 0, failed = 0;
  // Sending happens outside any database transaction; the attempt was counted first.
  for (const item of pending) {
    try {
      const result = await send({ to: item.email, ...compose(item.kind, item.payload, scope.orgId) });
      await withTenant(scope, (db) => db.query("UPDATE evals.notification_email SET status='sent',sent_at=now(),provider_message_id=$3 WHERE org_id=$1 AND id=$2", [scope.orgId, item.id, result.id]));
      sent++;
    } catch {
      await withTenant(scope, (db) => db.query(`UPDATE evals.notification_email SET last_error_code='email_send_failed',
        status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END WHERE org_id=$1 AND id=$2`, [scope.orgId, item.id]));
      failed++;
    }
  }
  return { sent, failed };
}

/** Delivery pass across every workspace that has opted-in recipients. */
export async function tickEmailNotifications(actorId: string, send: SendEmail) {
  const orgs = await withTenant({ orgId: "", actorId }, async (db) => (await db.query("SELECT evals.notification_due_workspaces() AS id")).rows.map((row) => row.id as string));
  const result = { workspaces: orgs.length, sent: 0, failed: 0 };
  for (const orgId of orgs) {
    const delivered = await deliverEmailNotifications({ orgId, actorId }, send);
    result.sent += delivered.sent; result.failed += delivered.failed;
  }
  return result;
}
