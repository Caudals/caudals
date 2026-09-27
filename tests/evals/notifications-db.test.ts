import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool, withTenant } from "../../lib/evals/repositories/db";
import { listActivity, listNotifications, markNotificationsRead } from "../../lib/evals/repositories/notifications";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("notification engine on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("turns job transitions into one notice each, keeps read state per person and lists activity", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au"), otherId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID(), jobId = randomUUID();
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      for (const id of [actorId, otherId]) await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Notice fixture", randomUUID() + "@example.test"]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Notice fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor')", [orgId, actorId, otherId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Notice fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Support bot','source_grounded',1,'EUR')", [evaluationId, orgId, projectId]);
      await db.query(`INSERT INTO evals.generation_job(org_id,id,evaluation_id,workflow_id,title,execution_mode,source_revision_ids,prompt_revision,prompt_revision_id,requested_case_count,status,created_by)
        VALUES($1,$2,$3,$4,'Support tests','deployed_system',$5,'p',$6,5,'profiling',$7)`, [orgId, jobId, evaluationId, randomUUID(), [randomUUID()], randomUUID(), actorId]);
      await db.query("UPDATE evals.generation_job SET status='needs_review' WHERE id=$1", [jobId]);
      await db.query("UPDATE evals.generation_job SET status='needs_review',updated_at=now() WHERE id=$1", [jobId]); // no transition, no notice
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }

    const scope = { orgId, actorId };
    const first = await listNotifications(scope);
    expect(first.notifications.map((item) => item.kind).sort()).toEqual(["generation_started", "test_set_ready"]);
    expect(first.notifications.find((item) => item.kind === "test_set_ready")?.payload).toMatchObject({ evaluationId, evaluationTitle: "Support bot", status: "needs_review" });
    expect(first.unread).toBe(1); // "started" is progress, shown in Activity only
    await markNotificationsRead(scope, { all: true });
    expect((await listNotifications(scope)).unread).toBe(0);
    expect((await listNotifications({ orgId, actorId: otherId })).unread).toBe(1);
    const activity = await listActivity(scope);
    expect(activity).toEqual([expect.objectContaining({ type: "generation", status: "needs_review", evaluation_title: "Support bot" })]);
    const reads = await withTenant({ orgId, actorId: otherId }, async (c) => (await c.query("SELECT count(*)::int AS n FROM evals.notification_read")).rows[0].n);
    expect(reads).toBe(0); // one person's reads are invisible to another
  });
});
