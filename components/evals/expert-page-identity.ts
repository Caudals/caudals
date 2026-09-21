import "server-only";
import { notFound } from "next/navigation";
import { requireExpertProfile } from "@/lib/evals/domain/expert-identity";
import { EvalError } from "@/lib/evals/domain/errors";
import { requireStageEEnabled } from "@/lib/evals/domain/features";
import { requirePageIdentity } from "./page-identity";

export async function requireExpertPageIdentity(next: string) {
  const identity = await requirePageIdentity(next);
  try {
    requireStageEEnabled();
    const expert = await requireExpertProfile(identity.user.id);
    return { identity, expert };
  } catch (error) {
    if (error instanceof EvalError && error.status === 404) notFound();
    throw error;
  }
}

export function requireStageEPage() {
  try { requireStageEEnabled(); }
  catch (error) {
    if (error instanceof EvalError && error.status === 404) notFound();
    throw error;
  }
}
