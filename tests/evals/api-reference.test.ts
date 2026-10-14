import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { canonicalJson } from "../../lib/evals/contracts/hashing";
import { createWebhookSignature } from "../../lib/evals/monitoring/webhook-protocol";
import { apiCurl, ciGateScript, githubActionExample, NODE_VERIFIER, PYTHON_VERIFIER, startRunCurl, webhookExample } from "../../lib/evals/api-reference";
import { CUSTOMER_API_LIMITS, CUSTOMER_API_RESOURCES, CUSTOMER_TOKEN_SCOPES, READ_TOKEN_SCOPES, WEBHOOK_EVENT_KINDS, WEBHOOK_PAYLOAD_FIELDS } from "../../lib/evals/monitoring/customer-api";
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
    // Every read scope has a list; runs:write (launch L-19) starts runs instead.
    expect(Object.values(CUSTOMER_API_RESOURCES).sort()).toEqual([...READ_TOKEN_SCOPES].sort());
    expect(CUSTOMER_TOKEN_SCOPES.filter(scope => !READ_TOKEN_SCOPES.includes(scope as never))).toEqual(["runs:write"]);
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

  it("gives a CI trigger example and a GitHub Actions workflow that parse and reuse one Idempotency-Key per attempt (launch L-19)", () => {
    const curl = startRunCurl("https://app.caudals.com", "org-1", { suiteVersionId: "sv-1", targetRevisionId: "tr-1" });
    expect(curl).toContain('-X POST "https://app.caudals.com/api/evals/v1/integrations/runs?orgId=org-1"');
    expect(curl).toContain('-H "Idempotency-Key: release-$(git rev-parse HEAD)"');
    expect(curl).toContain('{"suiteVersionId":"sv-1","targetRevisionId":"tr-1"}');
    expect(curl).toContain("/integrations/runs/$run_id/gate?orgId=org-1");
    const workflow = githubActionExample("https://app.caudals.com", "org-1");
    // YAML: two-space indentation, no tabs; the shell script is one literal block under `run: |`.
    expect(workflow).not.toMatch(/\t/);
    expect(workflow.split("\n").every(line => (line.length - line.trimStart().length) % 2 === 0)).toBe(true);
    expect(workflow).toContain("          CAUDALS_TOKEN: ${{ secrets.CAUDALS_TOKEN }}");
    expect(workflow).toContain("          CAUDALS_API: https://app.caudals.com/api/evals/v1");
    expect(workflow).toContain("          ORG_ID: org-1");
    const script = workflow.slice(workflow.indexOf("run: |") + 7).split("\n").map(line => line.slice(10)).join("\n");
    expect(script).toContain('Idempotency-Key: gh-${{ github.sha }}-${{ github.run_attempt }}');
    expect(script).toContain('"$CAUDALS_API/integrations/runs/$run_id/gate?orgId=$ORG_ID"');
    expect(script.trim().endsWith('test "$status" = "pass"')).toBe(true);
    // The script is valid shell (bash -n), with GitHub's expressions as they arrive after substitution.
    const file = join(directory, "gate.sh");
    writeFileSync(file, script.replaceAll("${{ github.sha }}", "abc").replaceAll("${{ github.run_attempt }}", "1"));
    execFileSync("bash", ["-n", file]);
    // The token is read from a secret, never written into the workflow.
    expect(githubActionExample("https://app.caudals.com", "org-1")).not.toMatch(/evct_/);
  });
});
