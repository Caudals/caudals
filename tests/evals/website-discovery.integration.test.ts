import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer as createHttpsServer } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { queueWebsiteConnectionCheck } from "../../lib/evals/repositories/stage-c";
import type { TenantTransaction } from "../../lib/evals/queue/store";
import { BrowserJobWorker } from "../../lib/evals/queue/browser-worker";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

/**
 * An unattended connection check: a public chatbot behind a cookie dialog is
 * found, tested in fresh sessions and saved as a new revision that carries its
 * own ready check, so the system shows as connected.
 */
describe.skipIf(!ownerUrl || !runtimeUrl)("unattended website connection check on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const browserPool = new Pool({ connectionString: ownerUrl, max: 4 });
  browserPool.on("connect", client => { void client.query("SET ROLE evals_browser"); });
  afterAll(async () => { await Promise.all([owner.end(), browserPool.end(), getEvalsPool().end()]); });

  it("finds the chat, tests it and connects the newest revision", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const directory = mkdtempSync(join(tmpdir(), "evals-discovery-"));
    const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
    const server = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      if (request.url !== "/help") { response.end("<!doctype html><h1>Marketing page</h1>"); return; }
      response.end(`<!doctype html><h1>Help centre</h1>
        <div class="cookie-banner" style="position:fixed;inset:0;background:#0008"><div style="background:#fff;margin:150px auto;width:420px;padding:20px">
        <p>We use cookies.</p><button onclick="this.closest('.cookie-banner').remove()">Reject all</button><button>Accept all</button></div></div>
        <div class="chat"><div class="log"></div><textarea placeholder="Ask a question"></textarea><button aria-label="Send" onclick="send()">➤</button></div><script>
        let turn=0;function send(){const ta=document.querySelector('textarea'),q=ta.value.trim();if(!q)return;ta.value='';
          const u=document.createElement('p');u.className='mine';u.textContent=q;document.querySelector('.log').append(u);
          setTimeout(()=>{const a=document.createElement('p');a.className='bot-reply';a.textContent='Answer '+(++turn)+' about '+q;document.querySelector('.log').append(a);},300);}
        </script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture_port_missing");
    const url = `https://127.0.0.1:${address.port}/help`;
    const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
    const actorId = `au_${randomUUID().replaceAll("-", "").slice(0, 26).toUpperCase()}`;
    const orgId = randomUUID(), projectId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID();
    const scope = { orgId, actorId };
    try {
      const config = { schema_version: "1.0", target_revision_id: revisionId, kind: "website", endpoint: new URL(url).origin + "/", login_start_url: url, recipe_revision_id: null, login_session_id: null,
        limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 30_000, repetitions: 1 }, requests_per_minute: 60, concurrent_sessions: 1, reset: "fresh_session" };
      const db = await owner.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
        await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,\'Discovery fixture\',$2,true)', [actorId, `${randomUUID()}@example.test`]);
        await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Discovery fixture',$2)", [orgId, actorId]);
        await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
        await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Help centre')", [projectId, orgId]);
        await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Help chat')", [targetId, orgId, projectId]);
        await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, "a".repeat(64), config]);
        await db.query("INSERT INTO evals.authorization_record(org_id,project_id,target_id,basis,scope,traffic_limit,expires_at) VALUES($1,$2,$3,'workspace_member_attestation',$4,'{}',now()+interval '1 day')", [orgId, projectId, targetId, { endpoint: config.endpoint }]);
        await db.query("COMMIT");
      } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }

      const check = await queueWebsiteConnectionCheck(scope, revisionId, randomUUID());
      const step = (await owner.query("SELECT id,input_hash FROM evals.workflow_step WHERE org_id=$1 AND input->>'connectionCheckId'=$2", [orgId, check.id])).rows[0];
      const tx: TenantTransaction = (tenant, fn) => withTenant(tenant, fn, browserPool);
      const worker = new BrowserJobWorker({ tx, keys: new Map(), actorId, workerId: randomUUID(), browser,
        destinationCheck: async (candidate) => { if (new URL(candidate).origin !== new URL(url).origin) throw new Error("destination_denied"); } });
      await worker.handle({ orgId, stepId: step.id, inputHash: step.input_hash });

      expect((await owner.query("SELECT status,error_code FROM evals.connection_check WHERE id=$1", [check.id])).rows[0]).toEqual({ status: "ready", error_code: null });
      const latest = (await owner.query(`SELECT tr.id,tr.document->>'recipe_revision_id' AS recipe,
          (SELECT status FROM evals.connection_check c WHERE c.org_id=tr.org_id AND c.target_revision_id=tr.id ORDER BY c.created_at DESC,c.id DESC LIMIT 1) AS status
        FROM evals.target_revision tr WHERE tr.org_id=$1 AND tr.target_id=$2 ORDER BY tr.created_at DESC,tr.id DESC LIMIT 1`, [orgId, targetId])).rows[0];
      expect(latest.id).not.toBe(revisionId);
      expect(latest.recipe).toBeTruthy();
      expect(latest.status).toBe("ready");
    } finally {
      await browser.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
