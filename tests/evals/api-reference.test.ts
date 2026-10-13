import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { canonicalJson } from "../../lib/evals/contracts/hashing";
import { createWebhookSignature } from "../../lib/evals/monitoring/webhook-protocol";
import { apiCurl, ciGateScript, NODE_VERIFIER, PYTHON_VERIFIER, webhookExample } from "../../lib/evals/api-reference";
import { CUSTOMER_API_LIMITS, CUSTOMER_API_RESOURCES, CUSTOMER_TOKEN_SCOPES, WEBHOOK_EVENT_KINDS, WEBHOOK_PAYLOAD_FIELDS } from "../../lib/evals/monitoring/customer-api";
import { customerTokenScope } from "../../lib/evals/monitoring/tokens";
import { createWebhookSchema } from "../../lib/evals/monitoring/webhooks";

// Launch L-20: the copy-paste webhook verifiers in Settings → Developers must
// accept what the app actually sends and reject tampering, stale clocks and
// replays, in both languages they are offered in.
const directory = mkdtempSync(join(tmpdir(), "caudals-api-reference-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const secret = randomBytes(32);
const id = randomUUID();
const now = new Date().toISOString();
const stale = new Date(Date.now() - 6 * 60_000).toISOString();
const body = canonicalJson({ event_id: "monitor:x:regression", event_kind: "regression", note: "é ünïcode", status: "regression" });
const cases = [
  { name: "valid", id, timestamp: now, body, signature: createWebhookSignature(secret, id, now, body) },
  { name: "replay", id, timestamp: now, body, signature: createWebhookSignature(secret, id, now, body) },
  { name: "tampered", id: randomUUID(), timestamp: now, body: body.replace("regression", "run_completed"), signature: "" },
  { name: "stale", id: randomUUID(), timestamp: stale, body, signature: "" },
  { name: "other-secret", id: randomUUID(), timestamp: now, body, signature: "" },
  { name: "missing", id: "", timestamp: now, body, signature: "" },
];
cases[2].signature = createWebhookSignature(secret, cases[2].id, now, body);
cases[3].signature = createWebhookSignature(secret, cases[3].id, stale, body);
cases[4].signature = createWebhookSignature(randomBytes(32), cases[4].id, now, body);
const expected = { valid: true, replay: false, tampered: false, stale: false, "other-secret": false, missing: false };
const env = { ...process.env, CAUDALS_WEBHOOK_SECRET: secret.toString("base64url") };
const casesJson = JSON.stringify(cases);

describe("API reference examples", () => {
  it("the Node.js verifier accepts a real delivery once and rejects the rest", () => {
    const file = join(directory, "verify.mjs");
    writeFileSync(file, `${NODE_VERIFIER}
const cases = ${casesJson};
const out = {};
for (const c of cases) out[c.name] = verifyCaudalsWebhook({ "x-caudals-delivery-id": c.id, "x-caudals-timestamp": c.timestamp, "x-caudals-signature": c.signature }, Buffer.from(c.body, "utf8"));
console.log(JSON.stringify(out));
`);
    expect(JSON.parse(execFileSync(process.execPath, [file], { env, encoding: "utf8" }))).toEqual(expected);
  });

  it("the Python verifier accepts a real delivery once and rejects the rest", () => {
    const file = join(directory, "verify.py");
    writeFileSync(file, `${PYTHON_VERIFIER}

import json
cases = json.loads(${JSON.stringify(casesJson)})
out = {}
for c in cases:
    headers = {"x-caudals-delivery-id": c["id"], "x-caudals-timestamp": c["timestamp"], "x-caudals-signature": c["signature"]}
    out[c["name"]] = verify_caudals_webhook(headers, c["body"].encode("utf-8"))
print(json.dumps(out))
`);
    expect(JSON.parse(execFileSync("python3", ["-I", file], { env, encoding: "utf8" }))).toEqual(expected);
  });

  it("documents the scopes, resources and events the routes accept", () => {
    expect(customerTokenScope.options).toEqual([...CUSTOMER_TOKEN_SCOPES]);
    expect(Object.values(CUSTOMER_API_RESOURCES).sort()).toEqual([...CUSTOMER_TOKEN_SCOPES].sort());
    expect(createWebhookSchema.shape.events.element.options).toEqual([...WEBHOOK_EVENT_KINDS]);
    // Retries wait 2^attempt minutes (lib/evals/monitoring/webhooks.ts) until the last attempt.
    expect(CUSTOMER_API_LIMITS.webhookRetryMinutes).toEqual(Array.from({ length: CUSTOMER_API_LIMITS.webhookAttempts - 1 }, (_, attempt) => 2 ** attempt));
    const example = JSON.parse(webhookExample());
    expect(Object.keys(example).sort()).toEqual(["event_id", "event_kind", ...WEBHOOK_PAYLOAD_FIELDS].sort());
    expect(webhookExample()).toBe(JSON.stringify(JSON.parse(canonicalJson(example)), null, 2));
  });

  it("builds curl examples with the workspace and no secret", () => {
    const curl = apiCurl("https://app.caudals.com", "org-1", "runs");
    expect(curl).toContain("https://app.caudals.com/api/evals/v1/integrations/runs?orgId=org-1");
    expect(curl).toContain("$CAUDALS_TOKEN");
    expect(ciGateScript("https://app.caudals.com", "org-1")).toContain("/integrations/ci/$SCHEDULE_ID?orgId=org-1");
  });
});
