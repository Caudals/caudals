/**
 * Copy-paste examples for the API reference in Settings → Developers (launch
 * L-20). Client-safe. The webhook verifiers are run against the real signer
 * in tests/evals/api-reference.test.ts, in Node and in Python.
 */
import { CUSTOMER_API_LIMITS, WEBHOOK_HEADERS, type CustomerResource } from "./monitoring/customer-api";

export function apiCurl(origin: string, orgId: string, resource: CustomerResource) {
  return `curl -s "${origin}/api/evals/v1/integrations/${resource}?orgId=${orgId}" \\
  -H "Authorization: Bearer $CAUDALS_TOKEN"`;
}

/** A release gate on the latest scheduled outcome (needs jq). */
export function ciGateScript(origin: string, orgId: string) {
  return `status=$(curl -s "${origin}/api/evals/v1/integrations/ci/$SCHEDULE_ID?orgId=${orgId}" \\
  -H "Authorization: Bearer $CAUDALS_TOKEN" | jq -r '.data.status')
if [ "$status" != "pass" ]; then
  echo "Caudals: latest scheduled run is $status"
  exit 1
fi`;
}

export function estimateCurl(origin: string, orgId: string) {
  return `curl -s -X POST "${origin}/api/evals/v1/billing/estimates" \\
  -H "Authorization: Bearer $CAUDALS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"orgId":"${orgId}","evaluationId":"<evaluation id>"}'`;
}

export type RunExampleIds = { suiteVersionId?: string; targetRevisionId?: string };
const ids = (example: RunExampleIds = {}) => ({
  suite: example.suiteVersionId ?? "<test set version id>",
  target: example.targetRevisionId ?? "<system version id>",
});

/** Starts a run from a pipeline and reads its gate (launch L-19, P-27). */
export function startRunCurl(origin: string, orgId: string, example?: RunExampleIds) {
  const { suite, target } = ids(example);
  return `run_id=$(curl -s -X POST "${origin}/api/evals/v1/integrations/runs?orgId=${orgId}" \\
  -H "Authorization: Bearer $CAUDALS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: release-$(git rev-parse HEAD)" \\
  -d '{"suiteVersionId":"${suite}","targetRevisionId":"${target}"}' | jq -r '.data.run_id')

curl -s "${origin}/api/evals/v1/integrations/runs/$run_id/gate?orgId=${orgId}" \\
  -H "Authorization: Bearer $CAUDALS_TOKEN"`;
}

/**
 * A GitHub Actions workflow: start the run (curl retries reuse the same
 * Idempotency-Key, so a retry never starts a second run), poll the gate every
 * 30 seconds, and fail the job unless it passes. Needs jq (on GitHub's runners).
 */
export function githubActionExample(origin: string, orgId: string, example?: RunExampleIds) {
  const { suite, target } = ids(example);
  return `# .github/workflows/caudals-gate.yml
name: Caudals release gate
on:
  workflow_dispatch:
  push:
    branches: [main]
jobs:
  caudals:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - name: Run the Caudals test set and check the gate
        env:
          CAUDALS_TOKEN: \${{ secrets.CAUDALS_TOKEN }}
          CAUDALS_API: ${origin}/api/evals/v1
          ORG_ID: ${orgId}
          SUITE_VERSION_ID: ${suite}
          TARGET_REVISION_ID: ${target}
        run: |
          set -euo pipefail
          run=$(curl -sS --fail-with-body --retry 3 --retry-all-errors -X POST \\
            "$CAUDALS_API/integrations/runs?orgId=$ORG_ID" \\
            -H "Authorization: Bearer $CAUDALS_TOKEN" \\
            -H "Content-Type: application/json" \\
            -H "Idempotency-Key: gh-\${{ github.sha }}-\${{ github.run_attempt }}" \\
            -d "{\\"suiteVersionId\\":\\"$SUITE_VERSION_ID\\",\\"targetRevisionId\\":\\"$TARGET_REVISION_ID\\"}")
          run_id=$(echo "$run" | jq -r '.data.run_id')
          echo "Caudals run $run_id"
          while true; do
            gate=$(curl -sS --fail-with-body --retry 3 --retry-all-errors \\
              "$CAUDALS_API/integrations/runs/$run_id/gate?orgId=$ORG_ID" \\
              -H "Authorization: Bearer $CAUDALS_TOKEN")
            status=$(echo "$gate" | jq -r '.data.status')
            [ "$status" != "pending" ] && break
            sleep 30
          done
          echo "$gate" | jq '.data'
          test "$status" = "pass"`;
}

/** A webhook body as sent: canonical JSON, keys sorted. */
export function webhookExample() {
  const body = {
    alert_id: "5b0c6f8e-3c1d-4a4e-9a51-2f0e7d1c9b42",
    baseline_run_id: "0d7a2c61-8f4b-4e3a-b6c9-7e1f5a2d3c84",
    dispatch_id: "9e4f1b27-6a3c-4d8e-a1f5-3b7c9d2e6f10",
    event_id: "monitor:9e4f1b27-6a3c-4d8e-a1f5-3b7c9d2e6f10:regression",
    event_kind: "regression",
    reason_codes: ["paired_case_regressed"],
    run_id: "c3a8e5d2-1f7b-4c6a-9e2d-8b4f0a6c1e37",
    status: "regression",
  };
  return JSON.stringify(body, null, 2);
}

const windowMs = CUSTOMER_API_LIMITS.signatureWindowSeconds * 1000;

export const NODE_VERIFIER = `import { createHmac, timingSafeEqual } from "node:crypto";

// The signing secret shown once when you added the endpoint.
const secret = Buffer.from(process.env.CAUDALS_WEBHOOK_SECRET, "base64url");
const seen = new Set(); // keep delivery ids in your database in production

// headers: the request headers (lower-case names); rawBody: the body as received (Buffer).
export function verifyCaudalsWebhook(headers, rawBody) {
  const id = headers["${WEBHOOK_HEADERS.id}"];
  const timestamp = headers["${WEBHOOK_HEADERS.timestamp}"] ?? "";
  const signature = Buffer.from(headers["${WEBHOOK_HEADERS.signature}"] ?? "");
  const sent = Date.parse(timestamp);
  if (!id || !Number.isFinite(sent) || Math.abs(Date.now() - sent) > ${windowMs}) return false;
  const expected = Buffer.from(
    "v1=" + createHmac("sha256", secret).update(\`\${id}.\${timestamp}.\`).update(rawBody).digest("hex"),
  );
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return false;
  if (seen.has(id)) return false; // a replay
  seen.add(id);
  return true;
}`;

export const PYTHON_VERIFIER = `import base64, hashlib, hmac, os, time
from datetime import datetime

# The signing secret shown once when you added the endpoint.
_value = os.environ["CAUDALS_WEBHOOK_SECRET"]
SECRET = base64.urlsafe_b64decode(_value + "=" * (-len(_value) % 4))
seen = set()  # keep delivery ids in your database in production

# headers: a case-insensitive mapping (e.g. request.headers); raw_body: the body as received (bytes).
def verify_caudals_webhook(headers, raw_body: bytes) -> bool:
    delivery_id = headers.get("${WEBHOOK_HEADERS.id}", "")
    timestamp = headers.get("${WEBHOOK_HEADERS.timestamp}", "")
    signature = headers.get("${WEBHOOK_HEADERS.signature}", "")
    try:
        sent = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return False
    if not delivery_id or abs(time.time() - sent) > ${CUSTOMER_API_LIMITS.signatureWindowSeconds}:
        return False
    message = f"{delivery_id}.{timestamp}.".encode() + raw_body
    expected = "v1=" + hmac.new(SECRET, message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return False
    if delivery_id in seen:  # a replay
        return False
    seen.add(delivery_id)
    return True`;
