import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { canonicalJson, sha256 } from "../../lib/evals/contracts/hashing";
import { decryptSecret } from "../../lib/evals/security/envelope";
import { listTargetCredentials, revokeTargetCredential, storeTargetCredential } from "../../lib/evals/repositories/credentials";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("write-only target credentials on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("encrypts, binds, rotates and revokes without any read-back path", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const master = randomBytes(32);
    const keyFile = join(mkdtempSync(join(tmpdir(), "evals-keyring-")), "keyring.json");
    writeFileSync(keyFile, JSON.stringify({ v1: master.toString("base64") }), { mode: 0o600 });
    process.env.EVALS_MASTER_KEYRING_FILE = keyFile;
    process.env.EVALS_MASTER_KEY_VERSION = "v1";

    const ownerId = createPrefixedId("au"), viewerId = createPrefixedId("au");
    const orgId = randomUUID(), otherOrgId = randomUUID(), projectId = randomUUID(), targetId = randomUUID(), revisionId = randomUUID();
    const config = {
      schema_version: "1.0", target_revision_id: revisionId, kind: "openai_compatible",
      endpoint: "https://api.example.test/v1/chat/completions", model: "fixture-model", credential: { kind: "none" },
      limits: { max_turns: 1, max_output_tokens: 500, max_tool_calls: 0, timeout_ms: 60000, repetitions: 1 },
      requests_per_minute: 6, concurrent_sessions: 1, reset: "fresh_session",
    };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [ownerId, orgId]);
      for (const id of [ownerId, viewerId]) {
        await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Credential fixture", `${randomUUID()}@example.test`]);
      }
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Credentials',$3),($2,'Other',$3)", [orgId, otherOrgId, ownerId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')", [orgId, ownerId, viewerId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Credential fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.target(id,org_id,project_id,title) VALUES($1,$2,$3,'API system')", [targetId, orgId, projectId]);
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [revisionId, orgId, targetId, sha256(canonicalJson(config)), config]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }

    const scope = { orgId, actorId: ownerId };
    const first = await storeTargetCredential(scope, targetId, { label: "Primary key", kind: "bearer", headerName: "Authorization", value: "sk-fixture-one" });
    expect(first.targetRevisionId).not.toBe(revisionId);

    // The web runtime can bind the revision but cannot read an envelope back.
    await expect(withTenant(scope, (c) => c.query("SELECT envelope FROM evals.secret_version WHERE org_id=$1", [orgId]))).rejects.toThrow(/permission denied/);
    const bound = await withTenant(scope, async (c) => (await c.query("SELECT document FROM evals.target_revision WHERE org_id=$1 AND id=$2", [orgId, first.targetRevisionId])).rows[0].document);
    expect(bound.credential).toEqual({ kind: "bearer", secret_version_id: first.versionId, header_name: "Authorization" });
    expect(bound.endpoint).toBe(config.endpoint);

    // Only a holder of the keyring and a privileged read can decrypt; AAD binds tenant, record, version and target.
    const envelope = async (versionId: string) => (await owner.query("SELECT envelope FROM evals.secret_version WHERE id=$1", [versionId])).rows[0].envelope;
    const keys = new Map([["v1", master]]);
    const secretScope = { orgId, recordId: first.recordId, versionId: first.versionId, purpose: "target" as const, scopeId: targetId };
    expect(decryptSecret(await envelope(first.versionId), secretScope, keys).toString()).toBe("sk-fixture-one");
    await expect(envelope(first.versionId).then((e) => decryptSecret(e, { ...secretScope, scopeId: randomUUID() }, keys))).rejects.toThrow("secret_unavailable");

    const rotated = await storeTargetCredential(scope, targetId, { recordId: first.recordId, label: "Primary key", kind: "bearer", headerName: "Authorization", value: "sk-fixture-two" });
    expect(rotated.recordId).toBe(first.recordId);
    const listed = await listTargetCredentials(scope, targetId);
    expect(listed.credentials).toHaveLength(1);
    expect(listed.credentials[0].versions).toHaveLength(2);
    expect(JSON.stringify(listed)).not.toContain("sk-fixture");
    expect(JSON.stringify(listed)).not.toContain("wrappedKey");

    // Viewers and other tenants cannot write, read metadata or revoke.
    await expect(storeTargetCredential({ orgId, actorId: viewerId }, targetId, { label: "x", kind: "bearer", headerName: "Authorization", value: "sk-viewer" })).rejects.toMatchObject({ status: 404 });
    await expect(listTargetCredentials({ orgId: otherOrgId, actorId: ownerId }, targetId)).rejects.toMatchObject({ status: 404 });
    await expect(revokeTargetCredential({ orgId, actorId: viewerId }, first.recordId)).rejects.toMatchObject({ status: 404 });

    await expect(revokeTargetCredential(scope, first.recordId)).resolves.toEqual({ recordId: first.recordId, revoked: true });
    const ledger = (await owner.query("SELECT action FROM evals.recovery_control_event WHERE org_id=$1 AND subject_id=$2", [orgId, first.recordId])).rows;
    expect(ledger).toEqual([{ action: "credential_revoked" }]);
    await expect(storeTargetCredential(scope, targetId, { recordId: first.recordId, label: "Primary key", kind: "bearer", headerName: "Authorization", value: "sk-after-revoke" })).rejects.toMatchObject({ status: 404 });
    const audit = (await owner.query("SELECT action FROM evals.audit_event WHERE org_id=$1 AND subject_id=$2 ORDER BY created_at", [orgId, first.recordId])).rows.map((r) => r.action);
    expect(audit).toEqual(["target_credential_created", "target_credential_rotated", "target_credential_revoked"]);
  });
});
