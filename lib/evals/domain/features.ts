import { EvalError } from "./errors";

export function requireStageEEnabled() {
  if (process.env.EVALS_EXPERT_WORK_ENABLED !== "true") {
    throw new EvalError("SCOPE_DENIED", 404, "This surface is not available.");
  }
}
