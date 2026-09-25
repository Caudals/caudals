import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getEvalsPool } from "../../lib/evals/repositories/db";
import { queueRequiredInputNotifications, tickEmailNotifications, type EmailMessage } from "../../lib/evals/operations/notifications";
import { createPrefixedId } from "../../lib/operator/ids";

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;
const runtimeUrl = process.env.EVALS_TEST_DATABASE_URL;

(ownerUrl && runtimeUrl ? describe : describe.skip)("opt-in email notifications on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(async () => { await owner.end(); await getEvalsPool().end(); });

  it("mails each notice once to opted-in members only and retries failures boundedly", async () => {
    process.env.EVALS_DATABASE_URL = runtimeUrl!;
    const optedIn = createPrefixedId("au"), silent = createPrefixedId("au"), completionOff = createPrefixedId("au");
    const orgId = randomUUID(), projectId = randomUUID(), evaluationId = randomUUID(), reportId = randomUUID();
    const emails = { [optedIn]: `in-${randomUUID()}@example.test`, [silent]: `quiet-${randomUUID()}@example.test`, [completionOff]: `off-${randomUUID()}@example.test` };
    const db = await owner.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [optedIn, orgId]);
      for (const [id, email] of Object.entries(emails)) await db.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [id, "Member", email]);
      await db.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Notify fixture',$2)", [orgId, optedIn]);
      for (const id of Object.keys(emails)) await db.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'viewer')", [orgId, id]);
      await db.query("INSERT INTO evals.notification_preference(org_id,user_id,email) VALUES($1,$2,true),($1,$3,false)", [orgId, optedIn, silent]);
      await db.query("INSERT INTO evals.notification_preference(org_id,user_id,email,completion) VALUES($1,$2,true,false)", [orgId, completionOff]);
      await db.query("INSERT INTO evals.project(id,org_id,title) VALUES($1,$2,'Notify')", [projectId, orgId]);
      await db.query("INSERT INTO evals.evaluation(id,org_id,project_id,title,evidence_policy,commercial_cap,currency,preparation_status) VALUES($1,$2,$3,'Needs answer','source_grounded',1,'EUR','needs_input')", [evaluationId, orgId, projectId]);
      await db.query("INSERT INTO evals.notification(org_id,event_id,kind,audience,payload,status,delivered_at) VALUES($1,$2,'report_published','workspace',$3,'delivered',now())", [orgId, `report:${reportId}:published`, { reportId }]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }

    const scope = { orgId, actorId: "service:notify-test" };
    expect(await queueRequiredInputNotifications(scope)).toBe(1);
    expect(await queueRequiredInputNotifications(scope)).toBe(0);
    const sent: EmailMessage[] = [];
    let fail = true;
    const send = async (message: EmailMessage) => { if (fail && message.subject.includes("needs one answer")) { fail = false; throw new Error("provider down"); } sent.push(message); return { id: randomUUID() }; };
    await tickEmailNotifications("service:notify-test", send);
    await tickEmailNotifications("service:notify-test", send);
    await tickEmailNotifications("service:notify-test", send);
    const mine = sent.filter((message) => Object.values(emails).includes(message.to));
    expect(mine.map((message) => `${message.to.split("-")[0]}:${message.subject}`).sort()).toEqual([
      "in:Caudals needs one answer to continue",
      "in:Your Caudals evaluation results are ready",
      "off:Caudals needs one answer to continue",
    ]);
    expect(mine.find((message) => message.subject.includes("results"))?.text).toContain(`/workspace/reports/${reportId}?orgId=${orgId}`);
    const rows = (await owner.query("SELECT status,attempts FROM evals.notification_email WHERE org_id=$1 ORDER BY attempts", [orgId])).rows;
    expect(rows.every((row) => row.status === "sent")).toBe(true);
    expect(rows.map((row) => row.attempts)).toContain(2);
  });
});
