import { redirect } from "next/navigation";
import { InvitationAcceptance } from "@/components/evals/invitation-acceptance";
import { requireIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";
import { EvalShell } from "@/components/evals/shell";
import { PublicFrame } from "@/components/evals/public-frame";
import { evalsPageMessages } from "@/components/evals/page-messages";
export default async function InvitationPage() {
  let identity;
  try {
    identity = await requireIdentity();
  } catch (error) {
    // Platform staff without TOTP while enforcement is on set it up first (launch L-08).
    if (error instanceof EvalError && error.code === "MFA_ENROLMENT_REQUIRED")
      redirect("/workspace/security");
    if (!(error instanceof EvalError) || error.code !== "SESSION_REQUIRED")
      throw error;
  }
  const content = <InvitationAcceptance authenticated={!!identity} />;
  // Signed in, the page is inside the app's shell and gets every message (L-24c).
  return identity ? (
    <>
      {await evalsPageMessages("all")}
      <EvalShell identity={identity}>{content}</EvalShell>
    </>
  ) : (
    <>
      {await evalsPageMessages(["workspace/invitations"])}
      <PublicFrame contextKey="invitations">{content}</PublicFrame>
    </>
  );
}
