import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { removeProviderConnection } from "../../lib/evals/repositories/engine-settings";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const adminUrl = process.env.EVALS_TEST_ADMIN_URL;

(ownerUrl && runtimeUrl && adminUrl ? describe : describe.skip)("removing an AI provider on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("retires its models, disables the account and deletes the key, while revisions stay otherwise frozen", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const dir = mkdtempSync(join(tmpdir(), "evals-provider-"));
    writeFileSync(join(dir, "admin.url"), adminUrl!, { mode: 0o600 });
    writeFileSync(join(dir, "keyring.json"), JSON.stringify({ v1: randomBytes(32).toString("base64") }), { mode: 0o600 });
    process.env.EVALS_ADMIN_DATABASE_URL_FILE = join(dir, "admin.url");
    process.env.EVALS_MASTER_KEYRING_FILE = join(dir, "keyring.json");

    const adminId = createPrefixedId("au"), orgId = randomUUID(), accountId = randomUUID(), revisionId = randomUUID(), priceId = randomUUID();
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [adminId, orgId]);
      await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [adminId, "Provider fixture", `admin-${randomUUID()}@example.test`]);
      await db.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [adminId]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Provider fixture',$2)", [orgId, adminId]);
      await db.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'Nvidia NIM fixture','EUR',50,true)", [accountId]);
      await db.query("INSERT INTO evals.provider_connection(account_id,adapter,endpoint,envelope,key_hint,created_by) VALUES($1,'openai_compatible','https://integrate.api.example.test/v1',NULL,NULL,$2)", [accountId, adminId]);
      await db.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
        VALUES($1,$2,'openai_compatible','https://integrate.api.example.test/v1','fixture-model','fixture',ARRAY['judge'],'{"text":true}',8192,512,ARRAY['synthetic'],ARRAY['eu'],60,100000,2)`, [revisionId, accountId]);
      await db.query("INSERT INTO evals.price_revision(id,provider_revision_id,currency,effective_at,billing_unit,input_price,output_price,cache_price,tool_price,uncertainty_bps,source) VALUES($1,$2,'EUR',now(),'token',0,0,0,0,0,'fixture')", [priceId, revisionId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }

    const admin: EvalIdentity = { user: { id: adminId, email: "a@example.test", name: "Admin" }, platformRole: "platform_admin", workspaces: [{ id: orgId, name: "Provider fixture", role: "operator" }], sessionCreatedAt: new Date().toISOString() };
    await expect(removeProviderConnection({ ...admin, sessionCreatedAt: new Date(Date.now() - 3_600_000).toISOString() }, orgId, accountId)).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    expect(await removeProviderConnection(admin, orgId, accountId)).toEqual({ id: accountId });

    const revision = (await owner.query("SELECT retired_at FROM evals.provider_revision WHERE id=$1", [revisionId])).rows[0];
    expect(revision.retired_at).not.toBeNull();
    expect((await owner.query("SELECT enabled FROM evals.provider_account WHERE id=$1", [accountId])).rows[0].enabled).toBe(false);
    expect((await owner.query("SELECT 1 FROM evals.provider_connection WHERE account_id=$1", [accountId])).rowCount).toBe(0);
    // Retiring is the only change a revision accepts, and only once; it can never be deleted.
    await expect(owner.query("UPDATE evals.provider_revision SET model_id='other' WHERE id=$1", [revisionId])).rejects.toThrow("immutable execution record");
    await expect(owner.query("UPDATE evals.provider_revision SET retired_at=now() WHERE id=$1", [revisionId])).rejects.toThrow("immutable execution record");
    await expect(owner.query("DELETE FROM evals.provider_revision WHERE id=$1", [revisionId])).rejects.toThrow("immutable execution record");
  });
});
