// Reference receiver for Caudals evaluation webhooks. It shares no code with
// the Caudals application: customers can copy it, and Caudals runs it as an
// independent check that deliveries verify outside the sender.
//
// Contract (see docs): headers x-caudals-delivery-id, x-caudals-timestamp and
// x-caudals-signature = "v1=" + hex(HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`)).
// The secret is the base64url value shown once when the endpoint is created.
// Reject timestamps outside five minutes and any delivery ID seen before.
import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";

export function verifyDelivery({ secret, id, timestamp, signature, rawBody, now = Date.now(), seen }) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return "rejected_format";
  const moment = Date.parse(timestamp ?? "");
  if (!Number.isFinite(moment) || Math.abs(now - moment) > 5 * 60_000) return "rejected_clock";
  if (typeof signature !== "string" || !/^v1=[0-9a-f]{64}$/.test(signature)) return "rejected_signature";
  const expected = Buffer.from("v1=" + createHmac("sha256", secret).update(`${id}.${timestamp}.`).update(rawBody).digest("hex"));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return "rejected_signature";
  if (seen.has(id)) return "rejected_replay";
  return "accepted";
}

export function startReceiver({ secret, port = 8080, prefix = "", stateFile }) {
  const seen = new Set(stateFile && existsSync(stateFile) ? readFileSync(stateFile, "utf8").split("\n").filter(Boolean).map((line) => line.split(" ")[0]) : []);
  const counts = { accepted: 0, rejected_format: 0, rejected_clock: 0, rejected_signature: 0, rejected_replay: 0, rejected_size: 0 };
  const server = createServer((request, response) => {
    const send = (status, body) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(body ? JSON.stringify(body) : undefined); };
    if (request.method === "GET" && request.url === `${prefix}/status`) return send(200, { counts, remembered: seen.size });
    if (request.method !== "POST" || request.url !== `${prefix}/deliveries`) return send(404);
    const chunks = []; let size = 0;
    request.on("data", (chunk) => { size += chunk.length; if (size > 65536) { counts.rejected_size++; send(413); request.destroy(); } else chunks.push(chunk); });
    request.on("end", () => {
      if (size > 65536) return;
      const id = request.headers["x-caudals-delivery-id"];
      const outcome = verifyDelivery({ secret, id, timestamp: request.headers["x-caudals-timestamp"], signature: request.headers["x-caudals-signature"], rawBody: Buffer.concat(chunks), seen });
      counts[outcome]++;
      if (outcome !== "accepted") return send(outcome === "rejected_replay" ? 409 : 401, { outcome });
      seen.add(id);
      if (stateFile) appendFileSync(stateFile, `${id} ${new Date().toISOString()}\n`, { mode: 0o600 });
      send(204);
    });
  });
  server.listen(port);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secretFile = process.env.WEBHOOK_SECRET_FILE;
  if (!secretFile) throw new Error("Set WEBHOOK_SECRET_FILE to the endpoint secret shown at creation");
  const secret = Buffer.from(readFileSync(secretFile, "utf8").trim(), "base64url");
  startReceiver({ secret, port: Number(process.env.PORT ?? 8080), prefix: process.env.PATH_PREFIX ?? "", stateFile: process.env.STATE_FILE });
  console.log(JSON.stringify({ event: "webhook_verifier_ready" }));
}
