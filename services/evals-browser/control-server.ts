import { createServer } from "node:http";
import { z } from "zod";
import { scopedBrowserStorageState, websiteRecipeSchema } from "../../lib/evals/contracts/browser";
import { remoteActionSchema } from "../../lib/evals/contracts/remote-browser";
import { openBrowserMessage, sealBrowserMessage } from "../../lib/evals/security/browser-wire";
import { decryptSecret, type Keyring } from "../../lib/evals/security/envelope";
import { withTenant } from "../../lib/evals/repositories/db";
import { BrowserControl, browserControlError } from "./control";

export function startBrowserControl(options: { control: BrowserControl; keys: Keyring; allowed: (orgId: string) => boolean; port?: number }) {
  const seen = new Map<string, number>();
  const timer = setInterval(() => { void options.control.expire(); for (const [id, time] of seen) if (time < Date.now() - 60_000) seen.delete(id); }, 30_000);
  timer.unref();
  const server = createServer(async (request, response) => {
    const requestId = request.headers["x-browser-request"];
    if (request.method !== "POST" || request.url !== "/control" || typeof requestId !== "string" || !z.uuid().safeParse(requestId).success) { response.writeHead(403).end(); return; }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 1_000_000) throw new Error("browser_control_denied"); chunks.push(chunk); }
      const input = z.strictObject({ at: z.number(), scope: z.strictObject({ orgId: z.uuid(), actorId: z.string().min(1).max(200), targetId: z.uuid(), endpoint: z.url() }), action: remoteActionSchema, initial: z.object({ state: z.unknown().optional(), recipe: websiteRecipeSchema.optional(), loginSessionId: z.uuid().optional() }).optional() }).parse(openBrowserMessage(JSON.parse(Buffer.concat(chunks).toString("utf8")), options.keys, "request", requestId));
      if (Math.abs(Date.now() - input.at) > 30_000 || seen.has(requestId) || !options.allowed(input.scope.orgId)) throw new Error("browser_control_denied");
      seen.set(requestId, Date.now());
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
        data = await options.control.dispatch(input.scope, input.action, { recipe: input.initial?.recipe, state: state ? scopedBrowserStorageState(state, input.scope.endpoint) : undefined });
      } finally { stateBytes?.fill(0); }
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(sealBrowserMessage({ data }, options.keys, "response", requestId)));
    } catch (error) {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(sealBrowserMessage({ error: browserControlError(error) }, options.keys, "response", requestId)));
    }
  });
  server.requestTimeout = 40_000; server.headersTimeout = 10_000; server.maxConnections = 12;
  server.listen(options.port ?? 8089, "0.0.0.0");
  return async () => { clearInterval(timer); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await options.control.close(); };
}
