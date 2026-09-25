import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { accountsOverview, amendBudget, auditLog, listProviders, usageOverview, writeProviderKey } from "../../lib/evals/repositories/platform";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;
const adminUrl = process.env.EVALS_TEST_ADMIN_URL;

(ownerUrl && runtimeUrl && adminUrl ? describe : describe.skip)("operator platform section on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("amends funded limits only for a recently signed-in admin, with attributed history", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const dir = mkdtempSync(join(tmpdir(), "evals-platform-"));
    writeFileSync(join(dir, "admin.url"), adminUrl!, { mode: 0o600 });
    writeFileSync(join(dir, "keyring.json"), JSON.stringify({ v1: randomBytes(32).toString("base64") }), { mode: 0o600 });
    process.env.EVALS_ADMIN_DATABASE_URL_FILE = join(dir, "admin.url");
    process.env.EVALS_MASTER_KEYRING_FILE = join(dir, "keyring.json");

    const adminId = createPrefixedId("au"), operatorId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID(), accountId = randomUUID(), providerId = randomUUID();
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [adminId, orgId]);
      for (const [id, email] of [[adminId, `admin-${randomUUID()}@example.test`], [operatorId, `op-${randomUUID()}@example.test`]]) {
        await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Platform fixture", email]);
      }
      await db.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin'),($2,'operator')", [adminId, operatorId]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Platform fixture',$2)", [orgId, adminId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, adminId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Platform')", [projectId, orgId]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Capped','source_grounded',500,'EUR')", [evaluationId, orgId, projectId]);
      await db.query("INSERT INTO evals.provider_account(id,name,currency,ceiling,enabled) VALUES($1,'fixture','EUR',50,true)", [accountId]);
      await db.query(`INSERT INTO evals.provider_revision(id,account_id,adapter,endpoint,model_id,owner_id,roles,capabilities,context_limit,output_limit,data_classes,regions,rpm,tpm,concurrency_limit)
        VALUES($1,$2,'openai_compatible','https://api.example.test/v1','fixture-model','fixture',ARRAY['judge'],'{"text":true}',8192,512,ARRAY['synthetic'],ARRAY['eu'],60,100000,2)`, [providerId, accountId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }

    const admin: EvalIdentity = { user: { id: adminId, email: "a@example.test", name: "Admin" }, platformRole: "platform_admin", workspaces: [{ id: orgId, name: "Platform fixture", role: "operator" }], sessionCreatedAt: new Date().toISOString() };
    const stale: EvalIdentity = { ...admin, sessionCreatedAt: new Date(Date.now() - 3_600_000).toISOString() };
    const operator: EvalIdentity = { ...admin, user: { ...admin.user, id: operatorId }, platformRole: "operator" };

    await expect(amendBudget(stale, orgId, { targetKind: "workspace_budget", ceiling: "250", currency: "EUR", reason: "Pilot scope" })).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await expect(amendBudget(operator, orgId, { targetKind: "workspace_budget", ceiling: "250", currency: "EUR", reason: "Pilot scope" })).rejects.toMatchObject({ status: 403 });
    await amendBudget(admin, orgId, { targetKind: "workspace_budget", ceiling: "250", currency: "EUR", reason: "Pilot scope agreed" });
    await expect(amendBudget(admin, orgId, { targetKind: "evaluation_cap", targetId: evaluationId, ceiling: "1500", reason: "Too high" })).rejects.toMatchObject({ status: 422 });
    await amendBudget(admin, orgId, { targetKind: "evaluation_cap", targetId: evaluationId, ceiling: "1000", reason: "Operator-authorized increase" });
    await amendBudget(admin, orgId, { targetKind: "entitlement", reason: "Enable monitoring", maxActiveRuns: 2, monthlySpendLimit: "750", allowedConnectionTypes: ["openai_compatible", "imported_responses"], canSchedule: true, canExport: true, reviewAllowance: 30 });
    await amendBudget(admin, orgId, { targetKind: "provider_account", targetId: accountId, ceiling: "80", currency: "EUR", enabled: false, reason: "Pause routing for key rotation" });

    // The web runtime still cannot change funded limits directly.
    await expect(withTenant({ orgId, actorId: adminId }, (c) => c.query("UPDATE evals.workspace_entitlement SET max_active_runs=50 WHERE org_id=$1", [orgId]))).rejects.toThrow(/permission denied/);

    const usage = await usageOverview({ orgId, actorId: adminId });
    expect(usage.entitlement).toMatchObject({ max_active_runs: 2, can_schedule: true, review_allowance: 30 });
    expect(usage.evaluations[0]).toMatchObject({ commercial_cap: "1000.000000000" });
    expect(usage.budgets.find((item) => item.kind === "workspace")).toMatchObject({ ceiling: "250.000000000" });
    expect(usage.amendments.map((item) => item.target_kind).sort()).toEqual(["entitlement", "evaluation_cap", "provider_account", "workspace_budget"]);
    await expect(owner.query("UPDATE evals.budget_amendment SET reason='changed' WHERE org_id=$1", [orgId])).rejects.toThrow(/immutable/);

    const key = await writeProviderKey(admin, orgId, { providerRevisionId: providerId, value: "sk-platform-fixture-key" });
    const providers = await listProviders({ orgId, actorId: adminId });
    expect(providers.accounts.find((item) => item.id === accountId)).toMatchObject({ enabled: false });
    expect(providers.revisions.find((item) => item.id === providerId)).toMatchObject({ endpoint_host: "api.example.test" });
    expect(providers.secrets).toEqual([expect.objectContaining({ id: key!.recordId, versions: 1, revoked_at: null })]);
    expect(JSON.stringify(providers)).not.toMatch(/sk-platform|wrappedKey|https:\/\/api/);

    const accounts = await accountsOverview({ orgId, actorId: adminId });
    expect(accounts.platformRoles.map((row) => row.role).sort()).toEqual(expect.arrayContaining(["operator", "platform_admin"]));
    const hidden = await accountsOverview({ orgId, actorId: operatorId });
    expect(hidden.platformRoles).toEqual([]);
    const audit = await auditLog({ orgId, actorId: adminId });
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["budget.amended.workspace_budget", "budget.amended.entitlement", "secret.created"]));
  });
});
