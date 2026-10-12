import "server-only";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { getResendClient } from "@/lib/resend/client";
import { appOrigin } from "@/lib/evals/signup";

/**
 * "Get help" (launch L-06): tells the operators, at the internal ops address
 * the platform alerts use, that a customer is stuck on their first
 * evaluation. The message carries the workspace and evaluation names, the
 * reason code and links; no customer content, addresses or secrets.
 */
export async function notifyOperatorsOfHelp(input: { requestId: string; orgId: string; evaluationId: string; workspace: string; evaluation: string; reason: string }) {
  const to = process.env.COLLABORATION_NOTIFICATION_EMAIL?.trim() || process.env.CONTACT_NOTIFICATION_EMAIL?.trim() || "hello@caudals.com";
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("email_unconfigured");
  const origin = appOrigin();
  const clean = (value: string) => value.replace(/[\r\n]+/g, " ").slice(0, 160);
  const text = [
    "A customer asked for help with their first evaluation.",
    "",
    `Workspace: ${clean(input.workspace)}`,
    `Evaluation: ${clean(input.evaluation)}`,
    `Reason: ${input.reason.replaceAll("_", " ")}`,
    "",
    `Evaluation: ${origin}/workspace/evaluations/${input.evaluationId}?orgId=${input.orgId}`,
    `Open help requests: ${origin}/ops/growth#help-requests`,
    "",
    `Request ${input.requestId}. Resolve it in Ops → Growth once the customer is unblocked.`,
  ].join("\n");
  const result = await getResendClient().emails.send({ from, to, subject: `Help requested: ${clean(input.workspace).slice(0, 80)}`, text }, { idempotencyKey: `onboarding-help-${input.requestId}` });
  if (result && "error" in result && result.error) throw new Error("help_email_failed");
}
