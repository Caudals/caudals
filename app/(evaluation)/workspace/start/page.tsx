import { notFound, redirect } from "next/navigation";
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
    await requireIdentity();
  } catch (error) {
    if (!(error instanceof EvalError) || error.code !== "SESSION_REQUIRED") throw error;
    return <SignupStart marketingOrigin={getMarketingSiteOrigin()} />;
  }
  redirect("/evaluation-entry");
}
