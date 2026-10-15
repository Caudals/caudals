import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { getPostgresPool } from "@/lib/db/client";
import { getEvalsPool, withTenant } from "@/lib/evals/repositories/db";
import { createPrefixedId } from "@/lib/operator/ids";
import { changeReviewAssignment, listReviewAssignments } from "@/lib/evals/repositories/review-assignments";
import { scoreRun } from "@/lib/evals/repositories/managed";
import { importedJudgeRunFixture } from "./judge-run-fixture";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;

/** Migration 113 on the disposable database: "Assign to me" in the ops review queue (launch G1, spec v2 §5.3). */
describe.skipIf(!ownerUrl || !runtimeUrl)("review queue assignments (migration 113)", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  let orgId: string, otherOrg: string, evaluationId: string, assessmentId: string;
  const people: Record<"ana" | "ben" | "admin" | "customer" | "outsider", string> = { ana: "", ben: "", admin: "", customer: "", outsider: "" };
  const as = (actor: keyof typeof people, org = orgId) => ({ orgId: org, actorId: people[actor] });

  async function user(name: string) {
    const id = createPrefixedId("au");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, name, `${randomUUID()}@example.test`]);
    return id;
  }

  beforeAll(async () => {
    Object.assign(process.env, { EVALS_DATABASE_URL: runtimeUrl, DATABASE_URL: runtimeUrl });
    const fixture = await importedJudgeRunFixture(owner, runtimeUrl!);
    orgId = fixture.orgId;
    evaluationId = fixture.evaluationId;
    // Grading writes the assessments the review queue shows.
    await scoreRun(fixture.scope, fixture.run.id, "judge-fixture-v1");
    assessmentId = (await owner.query("SELECT id FROM evals.assessment WHERE org_id=$1 ORDER BY created_at LIMIT 1", [orgId])).rows[0].id;
    // Two operators with operator memberships, a platform admin without one, the customer's owner and an operator of another client.
    people.ana = await user("Ana Operator");
    people.ben = await user("Ben Operator");
    people.admin = await user("Platform Admin");
    people.customer = await user("Customer Owner");
    people.outsider = await user("Other Operator");
    for (const id of [people.ana, people.ben, people.outsider]) await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'operator')", [id]);
    await owner.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,'platform_admin')", [people.admin]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator'),($1,$3,'operator'),($1,$4,'owner')", [orgId, people.ana, people.ben, people.customer]);
    otherOrg = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Other client',$2)", [otherOrg, people.outsider]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [otherOrg, people.outsider]);
  }, 60000);
  afterAll(async () => {
    await owner.end();
    await getEvalsPool().end();
    await getPostgresPool().end();
  });

  const audits = async (action: string) => Number((await owner.query("SELECT count(*)::int AS n FROM evals.audit_event WHERE org_id=$1 AND action=$2", [orgId, action])).rows[0].n);

  it("claims an item once, refuses a second claimant, and takes over only explicitly", async () => {
    const claimed = await changeReviewAssignment(as("ana"), { subjectKind: "assessment", subjectId: assessmentId, action: "assign" });
    expect(claimed).toMatchObject({ subjectKind: "assessment", subjectId: assessmentId, assigneeId: people.ana, assigneeName: "Ana Operator", mine: true });
    // Pressing it again changes nothing and writes no second audit.
    expect(await changeReviewAssignment(as("ana"), { subjectKind: "assessment", subjectId: assessmentId, action: "assign" })).toMatchObject({ assigneeId: people.ana });
    expect(await audits("review.assigned")).toBe(1);

    await expect(changeReviewAssignment(as("ben"), { subjectKind: "assessment", subjectId: assessmentId, action: "assign" })).rejects.toMatchObject({ code: "REVIEW_ASSIGNED", status: 409 });
    // Ben sees Ana's claim, not as his.
    expect(await listReviewAssignments(as("ben"))).toEqual([expect.objectContaining({ subjectId: assessmentId, assigneeName: "Ana Operator", mine: false })]);
    await expect(changeReviewAssignment(as("ben"), { subjectKind: "assessment", subjectId: assessmentId, action: "release" })).rejects.toMatchObject({ code: "REVIEW_ASSIGNED" });

    const taken = await changeReviewAssignment(as("ben"), { subjectKind: "assessment", subjectId: assessmentId, action: "assign", takeOver: true });
    expect(taken).toMatchObject({ assigneeId: people.ben, mine: true });
    const history = (await owner.query("SELECT assignee_id,released_by,release_reason FROM evals.review_assignment WHERE org_id=$1 AND subject_id=$2 ORDER BY assigned_at", [orgId, assessmentId])).rows;
    expect(history).toEqual([
      { assignee_id: people.ana, released_by: people.ben, release_reason: "taken_over" },
      { assignee_id: people.ben, released_by: null, release_reason: null },
    ]);
    const audit = (await owner.query("SELECT actor_id,details FROM evals.audit_event WHERE org_id=$1 AND action='review.assigned' ORDER BY created_at DESC LIMIT 1", [orgId])).rows[0];
    expect(audit).toEqual({ actor_id: people.ben, details: { subject_kind: "assessment", taken_over_from: people.ana } });

    expect(await changeReviewAssignment(as("ben"), { subjectKind: "assessment", subjectId: assessmentId, action: "release" })).toBeNull();
    expect(await changeReviewAssignment(as("ben"), { subjectKind: "assessment", subjectId: assessmentId, action: "release" })).toBeNull();
    expect(await audits("review.unassigned")).toBe(1);
    expect(await listReviewAssignments(as("ana"))).toEqual([]);
  });

  it("gives one claim when two people press at the same time", async () => {
    const results = await Promise.allSettled([people.ana, people.ben, people.ana, people.ben].map((actorId) =>
      changeReviewAssignment({ orgId, actorId }, { subjectKind: "evaluation", subjectId: evaluationId, action: "assign" })));
    const holders = new Set(results.filter((result) => result.status === "fulfilled").map((result) => (result as PromiseFulfilledResult<{ assigneeId: string }>).value.assigneeId));
    expect(holders.size).toBe(1);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "REVIEW_ASSIGNED" });
    expect((await owner.query("SELECT count(*)::int AS n FROM evals.review_assignment WHERE org_id=$1 AND subject_id=$2 AND released_at IS NULL", [orgId, evaluationId])).rows[0].n).toBe(1);
    // A platform admin may release anyone's claim (no membership needed, as requireWorkspace allows).
    expect(await changeReviewAssignment(as("admin"), { subjectKind: "evaluation", subjectId: evaluationId, action: "release" })).toBeNull();
    expect((await changeReviewAssignment(as("admin"), { subjectKind: "evaluation", subjectId: evaluationId, action: "assign" }))?.assigneeName).toBe("Platform Admin");
    await changeReviewAssignment(as("admin"), { subjectKind: "evaluation", subjectId: evaluationId, action: "release" });
  });

  it("is staff-only, workspace-scoped and written only through the function", async () => {
    // The customer's own owner never sees or makes assignments; nor does an operator of another client.
    await expect(changeReviewAssignment(as("customer"), { subjectKind: "assessment", subjectId: assessmentId, action: "assign" })).rejects.toMatchObject({ code: "SCOPE_DENIED", status: 404 });
    await expect(listReviewAssignments(as("customer"))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(changeReviewAssignment(as("outsider"), { subjectKind: "assessment", subjectId: assessmentId, action: "assign" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(listReviewAssignments(as("outsider"))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    // An item of one workspace cannot be claimed through another.
    await expect(changeReviewAssignment(as("outsider", otherOrg), { subjectKind: "assessment", subjectId: assessmentId, action: "assign" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(changeReviewAssignment(as("ana"), { subjectKind: "evaluation", subjectId: randomUUID(), action: "assign" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });

    await changeReviewAssignment(as("ana"), { subjectKind: "assessment", subjectId: assessmentId, action: "assign" });
    // Row-level security: staff read in the workspace; the customer reads nothing; nobody writes directly.
    expect(await withTenant(as("ana"), async (db) => (await db.query("SELECT count(*)::int AS n FROM evals.review_assignment WHERE released_at IS NULL")).rows[0].n)).toBe(1);
    // Staff also read the history of the workspace's claims (every earlier claim, released or taken over).
    expect(await withTenant(as("ana"), async (db) => (await db.query("SELECT count(*)::int AS n FROM evals.review_assignment WHERE released_at IS NOT NULL")).rows[0].n)).toBeGreaterThan(0);
    expect(await withTenant(as("outsider", otherOrg), async (db) => (await db.query("SELECT count(*)::int AS n FROM evals.review_assignment")).rows[0].n)).toBe(0);
    expect(await withTenant(as("customer"), async (db) => (await db.query("SELECT count(*)::int AS n FROM evals.review_assignment")).rows[0].n)).toBe(0);
    await expect(withTenant(as("ana"), (db) => db.query("INSERT INTO evals.review_assignment(org_id,subject_kind,subject_id,assignee_id,assigned_by) VALUES($1,'evaluation',$2,$3,$3)", [orgId, evaluationId, people.ana]))).rejects.toThrow(/permission denied/);
    await expect(withTenant(as("ana"), (db) => db.query("UPDATE evals.review_assignment SET assignee_id=$1", [people.ben]))).rejects.toThrow(/permission denied/);
    await expect(withTenant(as("ana"), (db) => db.query("DELETE FROM evals.review_assignment"))).rejects.toThrow(/permission denied/);
    await expect(withTenant(as("ana"), (db) => db.query("SELECT evals.review_assignment_staff($1)", [orgId]))).rejects.toThrow(/permission denied/);
  });

  it("refuses a deleted workspace", async () => {
    const org = randomUUID();
    await owner.query("INSERT INTO evals.workspace(id,name,created_by,deleted_at) VALUES($1,'Deleted client',$2,now())", [org, people.ana]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'operator')", [org, people.ana]);
    await expect(listReviewAssignments(as("ana", org))).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });

  it("the rollback refuses while assignments exist", async () => {
    const sql = await readFile(new URL("../../db/rollbacks/113_evals_review_assignment_down.sql", import.meta.url), "utf8");
    const client = await owner.connect();
    try {
      await expect(client.query(sql)).rejects.toThrow(/Rollback blocked: \d+ review assignments exist/);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.review_assignment') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });

  it("the rollback removes everything once no rows exist (checked in a transaction, then undone)", async () => {
    const sql = (await readFile(new URL("../../db/rollbacks/113_evals_review_assignment_down.sql", import.meta.url), "utf8")).replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM evals.review_assignment");
      await client.query(sql);
      expect((await client.query("SELECT to_regclass('evals.review_assignment') AS t, to_regprocedure('evals.review_assignments(uuid)') AS f")).rows[0]).toEqual({ t: null, f: null });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect((await owner.query("SELECT to_regclass('evals.review_assignment') IS NOT NULL AS present")).rows[0].present).toBe(true);
  });
});
