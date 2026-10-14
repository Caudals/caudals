import { EvalError } from "./errors";

export function requireStageEEnabled() {
  if (process.env.EVALS_EXPERT_WORK_ENABLED !== "true") {
    throw new EvalError("SCOPE_DENIED", 404, "This surface is not available.");
  }
}

/**
 * Expert review from request to reviewed report (launch L-26). Read on the
 * server at request time; off unless EXPERT_REVIEW_ORDERS_ENABLED=true. Orders
 * and assignments also need Stage E (EVALS_EXPERT_WORK_ENABLED).
 */
export function expertReviewOrdersEnabled(env: Record<string, string | undefined> = process.env) {
  return env.EXPERT_REVIEW_ORDERS_ENABLED === "true";
}

export function requireExpertReviewOrders() {
  if (!expertReviewOrdersEnabled()) throw new EvalError("SCOPE_DENIED", 404, "This surface is not available.");
}
