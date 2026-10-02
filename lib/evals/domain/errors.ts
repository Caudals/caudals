export class EvalError extends Error {
  constructor(public code: string, public status = 403, message = "This action is not available.") { super(message); }
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

export function inputError(error: unknown): EvalError | null {
  if (error instanceof EvalError || !(error instanceof Error)) return null;
  const message = INPUT_ERRORS[error.message];
  return message ? new EvalError("INPUT_INVALID", 422, message) : null;
}
