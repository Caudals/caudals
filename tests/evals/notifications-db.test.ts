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
  async function fixture() {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const actorId = createPrefixedId("au"), otherId = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID();
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [actorId, orgId]);
      for (const id of [actorId, otherId]) await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Notice fixture", randomUUID() + "@example.test"]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Notice fixture',$2)", [orgId, actorId]);
      await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'editor')", [orgId, actorId, otherId]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Notice fixture')", [projectId, orgId]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency) VALUES($1,$2,$3,'Support bot','source_grounded',1,'EUR')", [evaluationId, orgId, projectId]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
    return { actorId, otherId, orgId, projectId, evaluationId };
  }
  async function generation(f: Awaited<ReturnType<typeof fixture>>, status = "profiling", updated = new Date().toISOString()) {
    const id = randomUUID();
    await owner.query(`INSERT INTO evals.generation_job(org_id,id,evaluation_id,workflow_id,title,execution_mode,source_revision_ids,prompt_revision,prompt_revision_id,requested_case_count,status,created_by,updated_at)
      VALUES($1,$2,$3,$4,'Support tests','deployed_system',$5,'p',$6,5,$7,$8,$9)`, [f.orgId, id, f.evaluationId, randomUUID(), [randomUUID()], randomUUID(), status, f.actorId, updated]);
    return id;
  }
  it("deduplicates transitions and isolates reads per person", async () => {
    const f = await fixture(), jobId = await generation(f);
    await owner.query("UPDATE evals.generation_job SET status='needs_review' WHERE id=$1", [jobId]);
    await owner.query("UPDATE evals.generation_job SET status='needs_review',updated_at=now() WHERE id=$1", [jobId]);
    const first = await listNotifications(f);
    expect(first.notifications.map(item => item.kind)).toEqual(["test_set_ready"]);
    expect(first.notifications[0].payload).toMatchObject({ evaluationId: f.evaluationId, evaluationTitle: "Support bot", status: "needs_review" });
    expect(first.unread).toBe(1);
    await markNotificationsRead(f, { all: true });
    expect((await listNotifications(f)).unread).toBe(0);
    expect((await listNotifications({ ...f, actorId: f.otherId })).unread).toBe(1);
    expect(await listActivity(f)).toEqual([expect.objectContaining({ type: "generation", status: "needs_review", evaluation_title: "Support bot" })]);
    expect(await withTenant({ ...f, actorId: f.otherId }, async c => (await c.query("SELECT count(*)::int AS n FROM evals.notification_read")).rows[0].n)).toBe(0);
  });
  it("counts beyond the page, excludes progress before limiting and paginates without losing timestamp precision", async () => {
    const f = await fixture();
    await owner.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,created_at)
      SELECT $1,'ready:'||i,'report_published','workspace','{}','delivered',date_trunc('second',now())-interval '1 minute'+i*interval '1 microsecond'
      FROM generate_series(1,65) i`, [f.orgId]);
    await owner.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status)
      SELECT $1,'progress:'||i,'run_started','workspace','{}','delivered' FROM generate_series(1,100) i`, [f.orgId]);
    const first = await listNotifications(f, { limit: 10 });
    expect(first.notifications).toHaveLength(10);
    expect(first.unread).toBe(65);
    expect(first.notifications.every(item => item.category === "completion")).toBe(true);
    const ids = first.notifications.map(item => item.id as string);
    let cursor = first.nextCursor;
    while (cursor) {
      const next = await listNotifications(f, { limit: 10, before: cursor });
      ids.push(...next.notifications.map(item => item.id as string));
      cursor = next.nextCursor;
    }
    expect(ids).toHaveLength(65);
    expect(new Set(ids).size).toBe(65);
    const expected = (await owner.query("SELECT id FROM evals.notification WHERE org_id=$1 AND kind='report_published' ORDER BY created_at DESC,id DESC", [f.orgId])).rows.map(row => row.id);
    expect(ids).toEqual(expected);
    await markNotificationsRead(f, { ids: ids.slice(0, 2) });
    const unread = await listNotifications(f, { limit: 10, unreadOnly: true });
    expect(unread.unread).toBe(63);
    expect(unread.notifications[0].id).toBe(ids[2]);
    expect(unread.notifications.every(item => !item.read)).toBe(true);
  });
  it("respects preferences, audience, dismissal, retention and workspace isolation", async () => {
    const f = await fixture(), other = await fixture();
    await owner.query(`INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,created_at) VALUES
      ($1,'completion','report_published','workspace','{}','delivered',now()),
      ($1,'failure','run_failed','workspace','{}','delivered',now()),
      ($1,'dismissed','run_failed','workspace','{}','dismissed',now()),
      ($1,'internal','run_failed','operator','{}','delivered',now()),
      ($1,'old','run_failed','workspace','{}','delivered',now()-interval '31 days'),
      ($2,'other','run_failed','workspace','{}','delivered',now())`, [f.orgId, other.orgId]);
    await owner.query("INSERT INTO evals.notification_preference(org_id,user_id,completion,required_input,failure,email) VALUES($1,$2,false,true,true,false)", [f.orgId, f.actorId]);
    const notices = await listNotifications(f);
    expect(notices.unread).toBe(1);
    expect(notices.notifications.map(item => item.kind)).toEqual(["run_failed"]);
    const foreign = (await listNotifications(other)).notifications[0].id;
    expect(await markNotificationsRead(f, { ids: [foreign] })).toEqual({ marked: 0 });
    expect((await listNotifications(other)).unread).toBe(1);
    await markNotificationsRead(f, { all: true });
    expect((await listNotifications(f)).unread).toBe(0);
  });
  it("orders recent results before older running work across job types", async () => {
    const f = await fixture();
    const older = await generation(f, "drafting", "2026-10-07T08:00:00Z");
    const recent = await generation(f, "needs_review", "2026-10-07T09:00:00Z");
    // Use relative times so the three-day history contract remains testable in future years.
    await owner.query("UPDATE evals.generation_job SET updated_at=now()-interval '1 hour' WHERE id=$1", [older]);
    await owner.query("UPDATE evals.generation_job SET updated_at=now()-interval '1 minute' WHERE id=$1", [recent]);
    const sourceId = randomUUID();
    await owner.query("INSERT INTO evals.source(org_id,id,title,project_id,rights,created_by,evaluation_id) VALUES($1,$2,'Help site',$4,'customer_owned',$5,$3)", [f.orgId, sourceId, f.evaluationId, f.projectId, f.actorId]);
    const websiteId = randomUUID();
    await owner.query("INSERT INTO evals.website_source_job(org_id,id,evaluation_id,source_id,start_url,status,created_by,updated_at) VALUES($1,$2,$3,$4,'https://example.test','completed',$5,now()-interval '2 hours')", [f.orgId, websiteId, f.evaluationId, sourceId, f.actorId]);
    expect((await listActivity(f)).map(item => item.id)).toEqual([recent, older, websiteId]);
    expect((await listActivity({ ...f, orgId: (await fixture()).orgId }))).toHaveLength(0);
  });
});
