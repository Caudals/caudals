import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWebhookSignature } from "../../lib/evals/monitoring/webhook-protocol";
import { startReceiver, verifyDelivery } from "../../packages/webhook-verifier/receiver.mjs";

// Two independent implementations must agree: the sender in the app and the
// dependency-free reference receiver customers can run.
describe("independent webhook verification", () => {
  const secret = randomBytes(32);
  const shared = Buffer.from(secret.toString("base64url"), "base64url");
  const server = startReceiver({ secret: shared, port: 0, prefix: "/hooks", stateFile: join(mkdtempSync(join(tmpdir(), "hooks-")), "seen.log") });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it("accepts exact bytes once and rejects tampering, wrong keys, stale clocks and replays", async () => {
    const id = randomUUID(), timestamp = new Date().toISOString();
    const body = JSON.stringify({ event_id: "run:1:completed", event_kind: "run_completed", note: "é ünïcode" });
    const signature = createWebhookSignature(secret, id, timestamp, body);
    const seen = new Set<string>();
    expect(verifyDelivery({ secret: shared, id, timestamp, signature, rawBody: Buffer.from(body), seen })).toBe("accepted");
    expect(verifyDelivery({ secret: shared, id, timestamp, signature, rawBody: Buffer.from(body + " "), seen })).toBe("rejected_signature");
    expect(verifyDelivery({ secret: randomBytes(32), id, timestamp, signature, rawBody: Buffer.from(body), seen })).toBe("rejected_signature");
    const old = new Date(Date.now() - 6 * 60_000).toISOString();
    expect(verifyDelivery({ secret: shared, id, timestamp: old, signature: createWebhookSignature(secret, id, old, body), rawBody: Buffer.from(body), seen })).toBe("rejected_clock");

    const port = (server.address() as { port: number }).port;
    const post = (headers: Record<string, string>, payload = body) => fetch(`http://127.0.0.1:${port}/hooks/deliveries`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: payload });
    const headers = { "x-caudals-delivery-id": id, "x-caudals-timestamp": timestamp, "x-caudals-signature": signature };
    expect((await post(headers)).status).toBe(204);
    expect((await post(headers)).status).toBe(409);
    expect((await post(headers, body.replace("completed", "partial"))).status).toBe(401);
    const status = await (await fetch(`http://127.0.0.1:${port}/hooks/status`)).json();
    expect(status.counts).toMatchObject({ accepted: 1, rejected_replay: 1, rejected_signature: 1 });
  });
});
