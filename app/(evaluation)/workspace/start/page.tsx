import { notFound, redirect } from "next/navigation";
import { evalsPageMessages } from "@/components/evals/page-messages";
import { SignupStart } from "@/components/evals/signup-start";
import { requireIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";
import { directSignupEnabled } from "@/lib/evals/signup";
import { getMarketingSiteOrigin } from "@/lib/seo";

/**
 * Direct sign-up with a work email (launch L-05). Exists only while
 * SELF_SERVE_DIRECT_SIGNUP=true (read here, at request time). A signed-in
 * person goes to their workspace.
 */
export default async function StartPage() {
  if (!directSignupEnabled()) notFound();
  try {
    // Only "is someone signed in" matters here; the entry page enforces two-factor setup (L-08).
    await requireIdentity(undefined, { allowMfaEnrolment: true });
  } catch (error) {
    if (!(error instanceof EvalError) || error.code !== "SESSION_REQUIRED") throw error;
    return (
      <>
        {await evalsPageMessages(["workspace/start"])}
        <SignupStart marketingOrigin={getMarketingSiteOrigin()} />
      </>
    );
  }
  redirect("/evaluation-entry");
}
