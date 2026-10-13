import { PLAN_LIMIT_CODES, PLAN_LIMIT_MESSAGES, type PlanLimitKind, type PlanLimitView } from "../../billing/plans";

export class EvalError extends Error {
  constructor(public code: string, public status = 403, message = "This action is not available.") { super(message); }
}

/**
 * A typed plan limit (launch L-14, P-09): PLAN_LIMIT_SYSTEMS, _RUNS,
 * _QUESTIONS, _CONNECTION, _SCHEDULES or _MEMBERS. Raised only where plans v2
 * applies to the workspace (PLANS_V2_ENABLED or its override); the API adds
 * `limit` to the error body and the app opens the upgrade dialog.
 */
export class PlanLimitError extends EvalError {
  constructor(readonly kind: PlanLimitKind, readonly orgId: string | null, readonly limit: number | null = null, readonly connectionType: string | null = null) {
    super(PLAN_LIMIT_CODES[kind], 403, PLAN_LIMIT_MESSAGES[kind]);
    this.name = "PlanLimitError";
  }
  view(): PlanLimitView { return { kind: this.kind, limit: this.limit, connectionType: this.connectionType }; }
}

/**
 * Domain checks deep in pure code throw plain `Error(code)`. These codes are
 * input problems the person can fix, so the API answers 422 with guidance
 * instead of a generic "temporarily unavailable".
 */
const INPUT_ERRORS: Record<string, string> = {
  context_answer_invalid: "Answer each question in 1 to 2,000 characters.",
  context_answer_invalid_date: "Enter the effective date as YYYY-MM-DD. A year such as 2027 or a month such as 2027-03 also works.",
  context_answer_invalid_language: "Enter languages such as English, Spanish or es-ES, separated by commas.",
  context_language_invalid_bcp47: "Enter languages such as English, Spanish or es-ES, separated by commas.",
  context_answer_not_applicable: "That answer no longer matches an open question. Reload the page and answer again.",
  context_bound_exceeded: "The selected material does not fit the model's context window. Choose fewer sources or a model with a larger context in Settings → AI models.",
};

/**
 * Plan limits raised by the database triggers (migrations 075 and 093), as
 * answered while plans v2 is off for the workspace (the generic PLAN_LIMIT).
 */
const PLAN_LIMITS: Record<string, string> = {
  PLAN_LIMIT_SYSTEMS: "The free plan includes one AI system. Delete the current one or talk to us about a pilot.",
  PLAN_LIMIT_RUNS: "The free plan includes three runs a month. Talk to us about a pilot for more.",
  PLAN_LIMIT_MEMBERS: "This workspace has reached its plan's number of members. Talk to us about a managed plan for more.",
};

/** Prospect snapshot policy raised by the database triggers of migration 090 (launch L-21). */
const SNAPSHOT_POLICY: Record<string, string> = {
  SNAPSHOT_POLICY_BLOCKED: "A prospect snapshot runs only ordinary questions on a website chat, within its traffic limits and question count.",
};

export function inputError(error: unknown): EvalError | null {
  if (error instanceof EvalError || !(error instanceof Error)) return null;
  if (SNAPSHOT_POLICY[error.message]) return new EvalError("SNAPSHOT_POLICY_BLOCKED", 422, SNAPSHOT_POLICY[error.message]);
  if (PLAN_LIMITS[error.message]) return new EvalError("PLAN_LIMIT", 403, PLAN_LIMITS[error.message]);
  const message = INPUT_ERRORS[error.message];
  return message ? new EvalError("INPUT_INVALID", 422, message) : null;
}
