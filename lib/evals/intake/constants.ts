/**
 * Client-safe constants of "What we understood about your assistant"
 * (launch L-34). No imports: the Prepare page bundles this file.
 */
/** The reason a generation waits on the screen (generation_job and evaluation reason_code). */
export const CONFIRMATION_REASON = "context_confirmation_required";
/** Below this confidence a field is highlighted for the person to check. */
export const LOW_CONFIDENCE = 0.7;
/** How long generation waits for a confirmation before it continues with the inferred profile. */
export const CONFIRMATION_WAIT_MINUTES = 30;
