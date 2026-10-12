import "server-only";
import { redirect, notFound } from "next/navigation";
import { requireIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";
import { evaluationSecurityPath, evaluationSignInPath } from "./auth-path";
export async function requirePageIdentity(next: string) {
  try {
    return await requireIdentity();
  } catch (error) {
    if (error instanceof EvalError && error.code === "SESSION_REQUIRED")
      redirect(evaluationSignInPath(next));
    // Platform staff without TOTP while enforcement is on (launch L-08).
    if (error instanceof EvalError && error.code === "MFA_ENROLMENT_REQUIRED")
      redirect(evaluationSecurityPath(next));
    if (error instanceof EvalError && error.status === 404) notFound();
    throw error;
  }
}
