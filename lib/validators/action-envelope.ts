import { z } from "zod";

export type ActionErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DB_ERROR"
  | "INTERNAL_ERROR";

export type ActionError = {
  error: string;
  code: ActionErrorCode;
  fieldErrors?: Record<string, string[]>;
};

export function actionError(
  code: ActionErrorCode,
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionError {
  return {
    code,
    error,
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

export function zodErrorToFieldErrors(
  zodError: z.ZodError
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of zodError.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "root";
    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }
    fieldErrors[key].push(issue.message);
  }

  return fieldErrors;
}

export function validationErrorFromZod(
  zodError: z.ZodError,
  message = "Invalid input"
): ActionError {
  return actionError("VALIDATION_ERROR", message, zodErrorToFieldErrors(zodError));
}

export function parseInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  message = "Invalid input"
):
  | { success: true; data: z.infer<TSchema> }
  | { success: false; error: ActionError } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: validationErrorFromZod(parsed.error, message),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}
