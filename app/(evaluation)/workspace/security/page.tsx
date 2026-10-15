import { notFound, redirect } from "next/navigation";
import { evaluationReturnPath, evaluationSignInPath } from "@/components/evals/auth-path";
import { evalsPageMessages } from "@/components/evals/page-messages";
import { TwoFactorSettings } from "@/components/evals/two-factor-settings";
import { EvalError } from "@/lib/evals/domain/errors";
import { isPlatformStaff, requireIdentity } from "@/lib/evals/domain/identity";

/**
 * Two-factor authentication for the signed-in person (launch L-08). Staff
 * without TOTP land here while EVALS_ADMIN_MFA_REQUIRED=true; it is the one
 * page they can open until it is on. The flag is read on the server.
 */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  let identity;
  try {
    identity = await requireIdentity(undefined, { allowMfaEnrolment: true });
  } catch (error) {
    if (error instanceof EvalError && error.code === "SESSION_REQUIRED") redirect(evaluationSignInPath("/workspace/security"));
    if (error instanceof EvalError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      {await evalsPageMessages(["workspace/security"])}
      <TwoFactorSettings
        email={identity.user.email}
        enabled={identity.mfa?.enabled ?? false}
        required={identity.mfa?.required ?? false}
        staff={isPlatformStaff(identity)}
        next={evaluationReturnPath(typeof params.next === "string" ? params.next : undefined)}
      />
    </>
  );
}
