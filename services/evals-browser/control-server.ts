import { createServer, type IncomingMessage } from "node:http";
import { z } from "zod";
import { scopedBrowserStorageState, websiteRecipeSchema } from "../../lib/evals/contracts/browser";
import { remoteActionSchema, type RemoteStreamMessage } from "../../lib/evals/contracts/remote-browser";
import { openBrowserMessage, sealBrowserMessage } from "../../lib/evals/security/browser-wire";
import { decryptSecret, type Keyring } from "../../lib/evals/security/envelope";
import { withTenant } from "../../lib/evals/repositories/db";
import { BrowserControl, browserControlError } from "./control";

const scopeSchema = z.strictObject({ orgId: z.uuid(), actorId: z.string().min(1).max(200), targetId: z.uuid(), endpoint: z.url() });
const STREAM_MS = 4 * 60_000;

export function startBrowserControl(options: { control: BrowserControl; keys: Keyring; allowed: (orgId: string) => boolean; port?: number }) {
  const seen = new Map<string, number>();
  const timer = setInterval(() => { void options.control.expire(); for (const [id, time] of seen) if (time < Date.now() - 60_000) seen.delete(id); }, 15_000);
  timer.unref();
  // Every request is sealed by the app with a fresh ID, recent timestamp and
  // workspace allowlist check; a replayed request ID is refused.
  async function open<T extends z.ZodType>(request: IncomingMessage, requestId: string, schema: T): Promise<z.infer<T>> {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 1_000_000) throw new Error("browser_control_denied"); chunks.push(chunk); }
    const input = schema.parse(openBrowserMessage(JSON.parse(Buffer.concat(chunks).toString("utf8")), options.keys, "request", requestId)) as z.infer<T> & { at: number; scope: { orgId: string } };
    if (Math.abs(Date.now() - input.at) > 30_000 || seen.has(requestId) || !options.allowed(input.scope.orgId)) throw new Error("browser_control_denied");
    seen.set(requestId, Date.now());
    return input;
  }
  const server = createServer(async (request, response) => {
    const requestId = request.headers["x-browser-request"];
    if (request.method !== "POST" || !["/control", "/stream"].includes(request.url ?? "") || typeof requestId !== "string" || !z.uuid().safeParse(requestId).success) { response.writeHead(403).end(); return; }
    if (request.url === "/stream") {
      let unsubscribe: (() => void) | null = null;
      try {
        const input = await open(request, requestId, z.strictObject({ at: z.number(), scope: scopeSchema, sessionId: z.uuid() }));
        // Frames and state leave as a sequence of individually sealed lines.
        // The sequence number is authenticated, so lines cannot be reordered.
        let sequence = 0, blocked = false;
        const write = (message: RemoteStreamMessage) => {
          if (response.writableEnded) return false;
          if (blocked && message.type === "frame") return false;
          const ok = response.write(JSON.stringify(sealBrowserMessage(message, options.keys, "response", `${requestId}:${sequence++}`)) + "\n");
          if (!ok) { blocked = true; response.once("drain", () => { blocked = false; }); }
          return ok;
        };
        response.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
        unsubscribe = options.control.subscribe(input.scope, input.sessionId, message => {
          write(message);
          if (message.type === "closed") response.end();
        });
        const ping = setInterval(() => write({ type: "ping" }), 10_000);
        const limit = setTimeout(() => response.end(), STREAM_MS);
        const stop = () => { clearInterval(ping); clearTimeout(limit); unsubscribe?.(); unsubscribe = null; };
        response.once("close", stop);
        request.once("close", () => { if (!response.writableEnded) response.end(); });
      } catch (error) {
        unsubscribe?.();
        if (!response.headersSent) response.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
        response.end(JSON.stringify(sealBrowserMessage({ type: "closed", reason: browserControlError(error) }, options.keys, "response", `${requestId}:0`)) + "\n");
      }
      return;
    }
    try {
      const input = await open(request, requestId, z.strictObject({ at: z.number(), scope: scopeSchema, action: remoteActionSchema, initial: z.object({ state: z.unknown().optional(), recipe: websiteRecipeSchema.optional(), loginSessionId: z.uuid().optional(), startUrl: z.url().optional() }).optional() }));
      let stateBytes: Buffer | undefined;
      let data: unknown;
      try {
        let state = input.initial?.state;
        if (input.initial?.loginSessionId) {
          const sealed = await withTenant({ orgId: input.scope.orgId, actorId: "service:evals-browser" }, async db => {
            const row = (await db.query(`SELECT v.envelope,v.id AS version_id,r.id AS record_id FROM evals.browser_login_session s
              JOIN evals.secret_version v ON (v.org_id,v.id)=(s.org_id,s.secret_version_id)
              JOIN evals.secret_record r ON (r.org_id,r.id)=(v.org_id,v.record_id)
              JOIN evals.target_revision t ON t.org_id=s.org_id AND t.target_id=s.target_id AND t.document->>'login_session_id'=s.id::text
              WHERE s.org_id=$1 AND s.id=$2 AND s.target_id=$3 AND s.expires_at>now() AND s.revoked_at IS NULL AND r.revoked_at IS NULL AND r.scope_id=$3 AND r.purpose='target' LIMIT 1`, [input.scope.orgId,input.initial!.loginSessionId,input.scope.targetId])).rows[0];
            if (!row) throw new Error("browser_session_unavailable");
            return row;
          });
          stateBytes = decryptSecret(sealed.envelope, { orgId: input.scope.orgId, recordId: sealed.record_id, versionId: sealed.version_id, purpose: "target", scopeId: input.scope.targetId }, options.keys);
          state = JSON.parse(stateBytes.toString("utf8"));
        }
        data = await options.control.dispatch(input.scope, input.action, { recipe: input.initial?.recipe, startUrl: input.initial?.startUrl, state: state ? scopedBrowserStorageState(state, input.scope.endpoint) : undefined });
      } finally { stateBytes?.fill(0); }
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(sealBrowserMessage({ data }, options.keys, "response", requestId)));
    } catch (error) {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(sealBrowserMessage({ error: browserControlError(error) }, options.keys, "response", requestId)));
    }
  });
  server.requestTimeout = 40_000; server.headersTimeout = 10_000; server.maxConnections = 16;
  server.listen(options.port ?? 8089, "0.0.0.0");
  return async () => { clearInterval(timer); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await options.control.close(); };
}
