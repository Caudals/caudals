import { InvitationAcceptance } from "@/components/evals/invitation-acceptance";
import { requireIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";
import { EvalShell } from "@/components/evals/shell";
import { PublicFrame } from "@/components/evals/public-frame";
export default async function InvitationPage() {
  let identity;
  try {
    identity = await requireIdentity();
  } catch (error) {
    if (!(error instanceof EvalError) || error.code !== "SESSION_REQUIRED")
      throw error;
  }
  const content = <InvitationAcceptance authenticated={!!identity} />;
  return identity ? (
    <EvalShell identity={identity}>{content}</EvalShell>
  ) : (
    <PublicFrame contextKey="invitations">{content}</PublicFrame>
  );
}
