/**
 * Sends one synthetic error from a worker container through the worker
 * Sentry setup and its personal-data scrubber (launch L-08 drill):
 *   docker exec <worker or scheduler container> node --conditions=react-server --import tsx services/evals-worker/sentry-test.ts
 * Prints the event id, Sentry's HTTP status and the scrubbed message; the DSN
 * is never printed. The fake personal data in the message must arrive redacted.
 */
import * as Sentry from "@sentry/nextjs";
import { captureServerError, flushErrors } from "../../lib/observability/capture";
import { initWorkerSentry } from "../../lib/observability/worker-sentry";

async function main() {
  const service = process.env.SENTRY_SERVICE || "evals-worker";
  if (!initWorkerSentry(service)) {
    console.log(JSON.stringify({ test_event: null, enabled: false }));
    process.exitCode = 1;
    return;
  }
  let status: number | null = null;
  let scrubbed: string | null = null;
  Sentry.getClient()?.on("afterSendEvent", (event, response) => {
    status = response?.statusCode ?? null;
    scrubbed = event.exception?.values?.[0]?.value ?? null;
  });
  const eventId = captureServerError(
    new Error(`Sentry test event (${service}): contact jane.doe@example.com, +34 600 000 000, token sk_test_0123456789abcdefghij, ip 203.0.113.7`),
    { service, drill: "sentry-test-event" },
  );
  const flushed = await flushErrors(10_000);
  console.log(JSON.stringify({ test_event: eventId ?? null, flushed, http_status: status, scrubbed_message: scrubbed }));
  if (!flushed || status !== 200) process.exitCode = 1;
}
void main();
