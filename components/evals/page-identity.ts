import "server-only";
import { redirect, notFound } from "next/navigation";
import { requireIdentity } from "@/lib/evals/domain/identity";
import { EvalError } from "@/lib/evals/domain/errors";
import { evaluationSignInPath } from "./auth-path";
export async function requirePageIdentity(next: string) {
  try {
    return await requireIdentity();
  } catch (error) {
    if (error instanceof EvalError && error.code === "SESSION_REQUIRED")
      redirect(evaluationSignInPath(next));
    if (error instanceof EvalError && error.status === 404) notFound();
    throw error;
  }
}
