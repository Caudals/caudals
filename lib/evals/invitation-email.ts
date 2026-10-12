import "server-only";
import { withTenant } from "./repositories/db";
import { emailAppUrl, senderAddress } from "@/lib/email/links";
import { renderEmail } from "@/lib/email/templates";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { getResendClient } from "@/lib/resend/client";

/**
 * Emails a new workspace invitation to the address the owner entered (launch
 * L-07, with BRANDED_EMAILS_ENABLED). The private link still appears in the
 * dialog, so a failed send never blocks the invitation. Only the invitee's
 * address receives it; the idempotency key keeps one email per invitation.
 */
export async function sendInvitationEmail(input: {
  orgId: string;
  actorId: string;
  invitationId: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  token: string;
  inviter: string;
  locale: "en" | "es";
  expiresAt: string | Date;
}) {
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("email_unconfigured");
  const workspace = await withTenant({ orgId: input.orgId, actorId: input.actorId }, async (db) =>
    (await db.query<{ name: string }>("SELECT name FROM evals.workspace WHERE id=$1", [input.orgId])).rows[0]?.name);
  if (!workspace) throw new Error("workspace_unavailable");
  const hours = Math.max(1, Math.round((new Date(input.expiresAt).getTime() - Date.now()) / 3600_000));
  const email = renderEmail("invitation", input.locale, {
    url: `${emailAppUrl()}/workspace/invitations#token=${input.token}`,
    workspace,
    inviter: input.inviter.trim() || "Caudals",
    role: input.role,
    hours,
  });
  const { error } = await getResendClient().emails.send(
    { from: senderAddress(from), to: input.email, subject: email.subject, text: email.text, html: email.html },
    { idempotencyKey: `invitation-${input.invitationId}` },
  );
  if (error) throw new Error("email_provider_rejected");
}
