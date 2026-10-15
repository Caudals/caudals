/**
 * Settings → Members (launch U1): GET /workspaces/:id/members lists the
 * people in a workspace with their names and roles to its owners and
 * operators and to platform admins, the same rule as its invitations.
 * Editors, viewers and outsiders get 404; the SQL function returns nothing
 * to them even when called directly, outside the workspace's scope, or for a
 * deleted workspace. The database is scripts/evals/test-db.sh.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { createPrefixedId } from "@/lib/operator/ids";
import { testDatabaseUrls } from "../helpers/test-database";

// The route's signed-in person, as requireIdentity would resolve them.
const signedIn = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => signedIn.current!,
}));

const { ownerUrl, runtimeUrl } = testDatabaseUrls("workspace_people");

describe.skipIf(!ownerUrl || !runtimeUrl)("workspace members list on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 2 });
  const orgId = randomUUID(), otherOrgId = randomUUID(), deletedOrgId = randomUUID();
  const people = { owner: "", editor: "", viewer: "", operator: "", partner: "", admin: "", outsider: "" };
  const emails: Record<string, string> = {};

  async function user(key: keyof typeof people, name: string) {
    const id = createPrefixedId("au");
    emails[key] = `${key}-${randomUUID().slice(0, 8)}@example.test`;
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, name, emails[key]]);
    people[key] = id;
  }
  const identity = (key: keyof typeof people, role: EvalIdentity["workspaces"][number]["role"] | null, platformRole: EvalIdentity["platformRole"] = null): EvalIdentity => ({
    user: { id: people[key], email: emails[key], name: key }, platformRole, sessionCreatedAt: new Date().toISOString(),
    workspaces: role ? [{ id: orgId, name: "People fixture", role }] : [],
  });
  /** The SQL function as the runtime role, with the transaction scoped like withTenant does. */
  async function direct(actor: string, scope: string, target: string) {
    const db = await runtime.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.org_id',$1,true),set_config('evals.actor_id',$2,true)", [scope, actor]);
      return (await db.query("SELECT * FROM evals.list_workspace_people($1)", [target])).rows;
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      db.release();
    }
  }

  beforeAll(async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    await user("owner", "Olivia Owner");
    await user("editor", "Eduardo Editor");
    await user("viewer", "Vera Viewer");
    await user("operator", "Oscar Operator");
    await user("partner", "Paula Partner");
    await user("admin", "Ada Admin");
    await user("outsider", "Otto Outsider");
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [people.admin]);
    for (const [id, name] of [[orgId, "People fixture"], [otherOrgId, "Other fixture"], [deletedOrgId, "Deleted fixture"]])
      await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,$2,$3)", [id, name, people.owner]);
    await owner.query(`INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor'),($1,$4,'viewer'),($1,$5,'operator'),($1,$6,'viewer')`,
      [orgId, people.owner, people.editor, people.viewer, people.operator, people.partner]);
    // A partner-managed membership (launch L-28) is listed and marked as such.
    const partnerId = randomUUID();
    await owner.query("INSERT INTO evals.partner(id,name,created_by) VALUES($1,'Agencia fixture',$2)", [partnerId, people.admin]);
    await owner.query("UPDATE evals.membership SET partner_id=$3 WHERE org_id=$1 AND user_id=$2", [orgId, people.partner, partnerId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [otherOrgId, people.outsider]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [deletedOrgId, people.owner]);
    await owner.query("UPDATE evals.workspace SET deleted_at=now() WHERE id=$1", [deletedOrgId]);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await owner.end();
    await runtime.end();
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await getEvalsPool().end();
  });

  it("lists everyone with their name, role and join date to an owner, owners first", async () => {
    const { listWorkspacePeople } = await import("@/lib/evals/repositories/identity");
    const rows = await listWorkspacePeople(identity("owner", "owner"), orgId);
    // Owners, editors, viewers, then operators; by address within a role ("partner-…" before "viewer-…").
    expect(rows.map((row) => [row.name, row.role])).toEqual([
      ["Olivia Owner", "owner"], ["Eduardo Editor", "editor"], ["Paula Partner", "viewer"], ["Vera Viewer", "viewer"], ["Oscar Operator", "operator"],
    ]);
    expect(rows.find((row) => row.user_id === people.owner)).toMatchObject({ email: emails.owner, is_self: true, partner_managed: false });
    expect(rows.find((row) => row.user_id === people.editor)).toMatchObject({ is_self: false });
    expect(rows.find((row) => row.user_id === people.partner)).toMatchObject({ partner_managed: true });
    for (const row of rows) expect(Number.isNaN(Date.parse(row.joined_at))).toBe(false);
    // Nobody from another workspace.
    expect(rows.map((row) => row.user_id)).not.toContain(people.outsider);
  });

  it("answers the workspace's operators and platform admins (audited), and 404 to editors, viewers and outsiders", async () => {
    const { listWorkspacePeople } = await import("@/lib/evals/repositories/identity");
    expect(await listWorkspacePeople(identity("operator", "operator"), orgId)).toHaveLength(5);
    const before = (await owner.query("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id=$1 AND actor_id=$2 AND action='support.manage'", [orgId, people.admin])).rows[0].n;
    expect(await listWorkspacePeople(identity("admin", null, "platform_admin"), orgId)).toHaveLength(5);
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id=$1 AND actor_id=$2 AND action='support.manage'", [orgId, people.admin])).rows[0].n).toBe(before + 1);
    for (const [who, role] of [["editor", "editor"], ["viewer", "viewer"], ["outsider", null]] as const)
      await expect(listWorkspacePeople(identity(who, role), orgId), who).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 404 });
    // A deleted workspace has no members to show, not even to its owner.
    await expect(listWorkspacePeople(identity("owner", "owner"), deletedOrgId)).rejects.toMatchObject({ status: 404 });
  });

  it("the SQL function itself returns nothing outside its rule", async () => {
    expect(await direct(people.owner, orgId, orgId)).toHaveLength(5);
    expect(await direct(people.admin, orgId, orgId)).toHaveLength(5);
    expect(await direct(people.editor, orgId, orgId)).toEqual([]);
    expect(await direct(people.viewer, orgId, orgId)).toEqual([]);
    expect(await direct(people.outsider, orgId, orgId)).toEqual([]);
    // Scoped to one workspace, it never reads another one's members.
    expect(await direct(people.owner, otherOrgId, orgId)).toEqual([]);
    expect(await direct(people.outsider, otherOrgId, orgId)).toEqual([]);
    expect(await direct(people.owner, deletedOrgId, deletedOrgId)).toEqual([]);
    // The runtime role still cannot read other people's memberships or auth rows directly.
    const db = await runtime.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.org_id',$1,true),set_config('evals.actor_id',$2,true)", [orgId, people.owner]);
      expect((await db.query("SELECT user_id FROM evals.membership WHERE org_id=$1", [orgId])).rows.map((row) => row.user_id)).toEqual([people.owner]);
      await expect(db.query("SELECT email FROM public.auth_user LIMIT 1")).rejects.toThrow(/permission denied/);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      db.release();
    }
  });

  it("the rollback drops the two functions and gives fraud_queue back its 094 body (inside a transaction rolled back)", async () => {
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query(readFileSync("db/rollbacks/115_evals_workspace_people_down.sql", "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""));
      expect((await db.query("SELECT to_regprocedure('evals.list_workspace_people(uuid)') AS people, to_regprocedure('evals.expert_name(uuid)') AS name")).rows[0]).toEqual({ people: null, name: null });
      expect((await db.query("SELECT prosrc LIKE '%peak_24h%' AS peak FROM pg_proc WHERE oid='billing.fraud_queue(integer)'::regprocedure")).rows[0].peak).toBe(false);
    } finally {
      await db.query("ROLLBACK");
      db.release();
    }
    expect((await owner.query("SELECT prosrc LIKE '%peak_24h%' AS peak FROM pg_proc WHERE oid='billing.fraud_queue(integer)'::regprocedure")).rows[0].peak).toBe(true);
  });

  it("the route answers the owner and refuses an editor", async () => {
    const { GET } = await import("@/app/api/evals/v1/workspaces/[id]/members/route");
    const call = () => GET(new Request(`http://localhost/api/evals/v1/workspaces/${orgId}/members`, { headers: { host: "localhost" } }));
    signedIn.current = identity("owner", "owner");
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(((await ok.json()).data as unknown[]).length).toBe(5);
    signedIn.current = identity("editor", "editor");
    expect((await call()).status).toBe(404);
  });
});
