/**
 * INTAKE_V2_ENABLED (launch L-34, P-56): drag and drop of up to 50 files with
 * duplicate checks, "Import help centre", the scanned-PDF ask and "What we
 * understood about your assistant". Read on the server only and passed to the
 * app as a prop (never NEXT_PUBLIC_*). Off: today's intake.
 *
 * Workers do not read it: the browser worker only lists or reads what the app
 * queued with the flag on, the scheduler only times out confirmations that
 * exist, and the document worker records page statistics for every PDF.
 */
type Env = Record<string, string | undefined>;

export function intakeV2Enabled(env: Env = process.env): boolean {
  return env.INTAKE_V2_ENABLED === "true";
}
