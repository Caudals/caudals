import { redirect } from "next/navigation";
import { SelfServeSignup } from "@/components/evals/self-serve-signup";
import { requireIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";

/** Self-serve sign-up from the public demo's emailed link. A signed-in person goes to their workspace. */
export default async function SignupPage() {
  try {
    await requireIdentity();
  } catch (error) {
    if (!(error instanceof EvalError) || error.code !== "SESSION_REQUIRED") throw error;
    return <SelfServeSignup />;
  }
  redirect("/evaluation-entry");
}
