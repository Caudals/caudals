export class EvalError extends Error {
  constructor(public code: string, public status = 403, message = "This action is not available.") { super(message); }
}
