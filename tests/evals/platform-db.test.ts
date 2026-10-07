import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import type { EvalIdentity } from "../../lib/evals/domain/identity";
import { accountsOverview, amendBudget, amendWorkspaceMemberRole, auditLog, listProviders, usageOverview, writeProviderKey } from "../../lib/evals/repositories/platform";
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

    const adminId = createPrefixedId("au"), operatorId = createPrefixedId("au"), memberId = createPrefixedId("au");
    const otherOrgId = randomUUID(), otherMemberId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID(), accountId = randomUUID(), providerId = randomUUID();
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [adminId, orgId]);
      for (const [id, email] of [[adminId, `admin-${randomUUID()}@example.test`], [operatorId, `op-${randomUUID()}@example.test`], [memberId, `member-${randomUUID()}@example.test`], [otherMemberId, `other-${randomUUID()}@example.test`]]) {
        await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Platform fixture", email]);
      }
      await db.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin'),($2,'operator')", [adminId, operatorId]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Platform fixture',$2)", [orgId, adminId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [orgId, adminId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, memberId]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Other fixture',$2)", [otherOrgId, adminId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'viewer')", [otherOrgId, otherMemberId]);
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

    const entitlementInput = { targetKind: "entitlement", reason: "Later agreement", maxActiveRuns: 3, monthlySpendLimit: "800", allowedConnectionTypes: ["website"], canSchedule: false, canExport: false, reviewAllowance: 31 };
    await expect(amendBudget(admin, orgId, { ...entitlementInput, expectedVersion: 1 })).rejects.toMatchObject({ code: "SETTINGS_CONFLICT", status: 409 });
    await expect(amendBudget(operator, orgId, entitlementInput)).rejects.toMatchObject({ status: 403 });
    expect((await usageOverview({ orgId, actorId: adminId })).entitlement).toMatchObject({ version: 2, max_active_runs: 2 });

    // Roles are tenant-scoped and need the dedicated admin connection and fresh authentication.
    const roleChange = { role: "editor", previousRole: "owner", reason: "Updated responsibilities" };
    const customer = { ...admin, platformRole: null, user: { ...admin.user, id: memberId } };
    await expect(amendWorkspaceMemberRole(customer, orgId, memberId, roleChange)).rejects.toMatchObject({ status: 403 });
    await expect(amendWorkspaceMemberRole(operator, orgId, memberId, roleChange)).rejects.toMatchObject({ status: 403 });
    await expect(amendWorkspaceMemberRole(stale, orgId, memberId, roleChange)).rejects.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    await expect(amendWorkspaceMemberRole(admin, orgId, otherMemberId, { ...roleChange, previousRole: "viewer" })).rejects.toMatchObject({ status: 404 });
    await expect(amendWorkspaceMemberRole(admin, orgId, memberId, roleChange)).rejects.toMatchObject({ status: 422 });
    await expect(withTenant({ orgId, actorId: adminId }, (c) => c.query("UPDATE evals.membership SET role='owner' WHERE org_id=$1", [orgId]))).rejects.toThrow(/permission denied/);
    await expect(withTenant({ orgId, actorId: adminId }, (c) => c.query("SELECT evals.amend_workspace_member_role($1,'owner','operator','Direct write')", [adminId]))).rejects.toThrow(/permission denied/);
    await amendWorkspaceMemberRole(admin, orgId, adminId, { role: "owner", previousRole: "operator", reason: "Assign another owner" });
    // Concurrent demotions serialize; one owner always survives.
    const demotions = await Promise.allSettled([
      amendWorkspaceMemberRole(admin, orgId, adminId, { role: "viewer", previousRole: "owner", reason: "Change first owner" }),
      amendWorkspaceMemberRole(admin, orgId, memberId, { role: "editor", previousRole: "owner", reason: "Change second owner" }),
    ]);
    expect(demotions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.membership WHERE org_id=$1 AND role='owner'", [orgId])).rows[0].n).toBe(1);
    const changed = demotions[0].status === "fulfilled" ? adminId : memberId;
    await expect(amendWorkspaceMemberRole(admin, orgId, changed, { role: "operator", previousRole: "owner", reason: "Stale role" })).rejects.toMatchObject({ code: "SETTINGS_CONFLICT" });
    const scopedMembers = await withTenant({ orgId, actorId: adminId }, (c) => c.query("SELECT * FROM evals.list_workspace_members($1)", [orgId]));
    expect(scopedMembers.rows.map((row) => row.user_id).sort()).toEqual([adminId, memberId].sort());
    const hiddenMembers = await withTenant({ orgId, actorId: memberId }, (c) => c.query("SELECT * FROM evals.list_workspace_members($1)", [orgId]));
    expect(hiddenMembers.rows).toEqual([]);
    const wrongScope = await withTenant({ orgId, actorId: adminId }, (c) => c.query("SELECT * FROM evals.list_workspace_members($1)", [otherOrgId]));
    expect(wrongScope.rows).toEqual([]);
    const roleAudits = (await owner.query("SELECT actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action='membership.role_amended' ORDER BY created_at", [orgId])).rows;
    expect(roleAudits).toHaveLength(2);
    expect(roleAudits[0]).toMatchObject({ actor_id: adminId, details: { previous_role: "operator", role: "owner", reason: "Assign another owner" } });
    expect((await owner.query("SELECT role FROM evals.platform_role WHERE user_id=$1", [adminId])).rows[0].role).toBe("platform_admin");

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
