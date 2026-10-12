import { redirect } from "next/navigation";
import { SelfServeSignup } from "@/components/evals/self-serve-signup";
import { requireIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";
import { directSignupEnabled } from "@/lib/evals/signup";
import { signupTermsRequired } from "@/lib/legal/acceptance";
import { getMarketingSiteOrigin } from "@/lib/seo";

/** Self-serve sign-up from an emailed link (public demo or direct sign-up). A signed-in person goes to their workspace. */
export default async function SignupPage() {
  try {
    // Only "is someone signed in" matters here; the entry page enforces two-factor setup.
    await requireIdentity(undefined, { allowMfaEnrolment: true });
  } catch (error) {
    if (!(error instanceof EvalError) || error.code !== "SESSION_REQUIRED") throw error;
    // Flags are read here, at request time, and passed down (never NEXT_PUBLIC_*).
    return <SelfServeSignup termsRequired={signupTermsRequired()} directSignup={directSignupEnabled()} marketingOrigin={getMarketingSiteOrigin()} />;
  }
  redirect("/evaluation-entry");
}
