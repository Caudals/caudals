import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { canonicalJson, sha256 } from "../../lib/evals/contracts/hashing";
import { decryptSecret } from "../../lib/evals/security/envelope";
import { getBrowserCapture, listLoginSessions, revokeLoginSession, storeLoginSession } from "../../lib/evals/repositories/browser-sessions";
import { tickLifecycle } from "../../lib/evals/operations/lifecycle";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("website login sessions and discovery captures on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("stores site-scoped, expiring, write-only sessions and purges expired captures", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const key = randomBytes(32);
    const file = join(mkdtempSync(join(tmpdir(), "browser-keys-")), "keys.json");
    writeFileSync(file, JSON.stringify({ b1: key.toString("base64") }), { mode: 0o600 });
    process.env.EVALS_BROWSER_SESSION_KEYRING_FILE = file;
    const actorId = createPrefixedId("au"), orgId = randomUUID(), projectId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID();
    const config = { schema_version: "1.0", target_revision_id: revisionId, kind: "website", endpoint: "https://chat.example.test/help", recipe_revision_id: null, login_session_id: null,
      limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 }, requests_per_minute: 6, concurrent_sessions: 1, reset: "fresh_session" };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [actorId, "Browser fixture", `${randomUUID()}@example.test`]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Browser fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, actorId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Browser')", [projectId, orgId]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'Site')", [targetId, orgId, projectId]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, sha256(canonicalJson(config)), config]);
      await db.query(`INSERT INTO evals.browser_capture(org_id,target_revision_id,reason_code,media_type,bytes,sha256,created_at,expires_at)
        VALUES($1,$2,'recipe_not_found','image/jpeg',$3,$4,now()-interval '8 days',now()-interval '1 day'),($1,$2,'captcha_present','image/jpeg',$3,$4,now(),now()+interval '7 days')`,
      [orgId, revisionId, Buffer.from([0xff, 0xd8, 0xff]), "a".repeat(64)]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    const scope = { orgId, actorId };
    const state = { cookies: [{ name: "sid", value: "session-cookie-value", domain: "chat.example.test", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }], origins: [] };

    await expect(storeLoginSession(scope, targetId, { storageState: { ...state, cookies: [{ ...state.cookies[0], domain: "evil.example.test" }] }, expiresInHours: 24 })).rejects.toMatchObject({ status: 422 });
    await expect(storeLoginSession(scope, targetId, { storageState: state, expiresInHours: 500 })).rejects.toMatchObject({ status: 422 });
    const stored = await storeLoginSession(scope, targetId, { storageState: state, expiresInHours: 24 });
    const bound = (await owner.query("SELECT document FROM evals.target_revision WHERE id=$1", [stored.targetRevisionId])).rows[0].document;
    expect(bound.login_session_id).toBe(stored.sessionId);
    const secret = (await owner.query(`SELECT v.envelope,v.id,v.record_id FROM evals.browser_login_session s JOIN evals.secret_version v ON v.id=s.secret_version_id WHERE s.id=$1`, [stored.sessionId])).rows[0];
    const opened = JSON.parse(decryptSecret(secret.envelope, { orgId, recordId: secret.record_id, versionId: secret.id, purpose: "target", scopeId: targetId }, new Map([["b1", key]])).toString());
    expect(opened.cookies[0].value).toBe("session-cookie-value");
    await expect(withTenant(scope, (c) => c.query("SELECT envelope FROM evals.secret_version WHERE org_id=$1", [orgId]))).rejects.toThrow(/permission denied/);

    const listed = await listLoginSessions(scope, targetId);
    expect(listed.sessions).toEqual([expect.objectContaining({ id: stored.sessionId, state: "active" })]);
    expect(JSON.stringify(listed)).not.toContain("session-cookie-value");
    expect(listed.captures.map((capture) => capture.reason_code)).toEqual(["captcha_present"]);
    expect((await getBrowserCapture(scope, listed.captures[0].id)).media_type).toBe("image/jpeg");

    await revokeLoginSession(scope, targetId, stored.sessionId);
    expect((await listLoginSessions(scope, targetId)).sessions[0].state).toBe("revoked");
    const purged = await tickLifecycle("service:browser-test");
    expect(purged.captures).toBeGreaterThanOrEqual(1);
    expect(Number((await owner.query("SELECT count(*) FROM evals.browser_capture WHERE org_id=$1", [orgId])).rows[0].count)).toBe(1);
  });
});
