/**
 * The example evaluation (launch L-33) on the real schema: no API route can
 * run, edit, share, schedule, export, compare or delete it, PostgreSQL cannot
 * store its identifiers, and a workspace that has opened it still has no
 * runs, reports, shares, schedules, exports, billing or analytics rows, so it
 * never counts towards plan limits, credits, product metrics or activation.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { exampleBundle } from "@/lib/evals/example";
import { createPrefixedId } from "@/lib/operator/ids";

const identity = vi.hoisted(() => ({ current: null as EvalIdentity | null }));
vi.mock("@/lib/evals/domain/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evals/domain/identity")>()),
  requireIdentity: async () => identity.current!,
}));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL, runtimeUrl = process.env.EVALS_TEST_RUNTIME_DATABASE_URL;

describe.skipIf(!ownerUrl || !runtimeUrl)("example evaluation is read-only on PostgreSQL", () => {
  const owner = new Pool({ connectionString: ownerUrl, max: 1 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
  const orgId = randomUUID(), userId = createPrefixedId("au");
  const latest = exampleBundle("en").runs[2], previous = exampleBundle("en").runs[1];
  const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json", "idempotency-key": `example-${randomUUID()}` };
  const call = (path: string, method: string, body?: unknown) => new Request(`http://localhost/api/evals/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  /** Row counts for this workspace in every table that limits, credits, metrics or activation read. */
  async function footprint() {
    const tables = ["evals.evaluation", "evals.run", "evals.report", "evals.report_revision", "evals.share_grant", "evals.monitor_schedule", "evals.export_job", "evals.comparison", "evals.execution_budget", "public.product_analytics_event"];
    const billing = await owner.query("SELECT table_name FROM information_schema.columns WHERE table_schema='billing' AND column_name='org_id' ORDER BY table_name");
    tables.push(...billing.rows.map((row) => `billing.${row.table_name}`));
    const counts: Record<string, number> = {};
    for (const table of tables) counts[table] = (await owner.query(`SELECT count(*)::int AS n FROM ${table} WHERE org_id=$1`, [orgId])).rows[0].n;
    return counts;
  }
  let before: Record<string, number> = {};

  beforeAll(async () => {
    vi.stubEnv("EVALS_DATABASE_URL", runtimeUrl!);
    vi.stubEnv("DATABASE_URL", runtimeUrl!);
    vi.stubEnv("EXAMPLE_EVALUATION_ENABLED", "true");
    await owner.query('INSERT INTO public.auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Example fixture owner", `${randomUUID()}@example.test`]);
    await owner.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'Example fixture',$2)", [orgId, userId]);
    await owner.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,'owner')", [orgId, userId]);
    identity.current = { user: { id: userId, email: "owner@example.test", name: "Owner" }, platformRole: null, workspaces: [{ id: orgId, name: "Example fixture", role: "owner" }] };
    before = await footprint();
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await owner.end();
    await runtime.end();
    const { getEvalsPool } = await import("@/lib/evals/repositories/db");
    await getEvalsPool().end();
  });

  it("refuses every write and read that names the example through the API", async () => {
    const attempts: Array<[string, Promise<Response>]> = [
      ["start a run", import("@/app/api/evals/v1/runs/route").then(({ POST }) => POST(call("/runs", "POST", { orgId, evaluationId: "example-evaluation", targetRevisionId: latest.system.target_revision_id, suiteVersionId: latest.scope.suite_version_id, executionMode: "deployed_system" })))],
      ["start the evaluation", import("@/app/api/evals/v1/evaluations/[id]/start/route").then(({ POST }) => POST(call("/evaluations/example-evaluation/start", "POST", { orgId })))],
      ["share the report", import("@/app/api/evals/v1/reports/[id]/shares/route").then(({ POST }) => POST(call(`/reports/${latest.report_revision_id}/shares`, "POST", { orgId, reportRevisionId: latest.report_revision_id, audience: "bearer", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), permittedFields: ["findings"] })))],
      ["publish the report", import("@/app/api/evals/v1/reports/[id]/publish/route").then(({ POST }) => POST(call(`/reports/${latest.report_revision_id}/publish`, "POST", { orgId, revisionId: latest.report_revision_id })))],
      ["read the report", import("@/app/api/evals/v1/reports/[id]/route").then(({ GET }) => GET(call(`/reports/${latest.report_revision_id}?orgId=${orgId}`, "GET")))],
      ["rename it", import("@/app/api/evals/v1/items/[kind]/[id]/route").then(({ PATCH }) => PATCH(call(`/items/reports/${latest.report_revision_id}`, "PATCH", { orgId, title: "Renamed" })))],
      ["delete it", import("@/app/api/evals/v1/items/[kind]/[id]/route").then(({ DELETE }) => DELETE(call(`/items/evaluations/example-evaluation?orgId=${orgId}`, "DELETE")))],
      ["schedule it", import("@/app/api/evals/v1/schedules/route").then(({ POST }) => POST(call("/schedules", "POST", { orgId, evaluationId: "example-evaluation", targetRevisionId: latest.system.target_revision_id, suiteVersionId: latest.scope.suite_version_id, cadence: "monthly", timezone: "Europe/Madrid", localTime: "09:00", dayOfMonth: 5 })))],
      ["export it", import("@/app/api/evals/v1/exports/route").then(({ POST }) => POST(call("/exports", "POST", { orgId, reportRevisionId: latest.report_revision_id, kind: "pdf" })))],
      ["compare its runs", import("@/app/api/evals/v1/comparisons/route").then(({ POST }) => POST(call("/comparisons", "POST", { orgId, baselineRunId: previous.run_id, candidateRunId: latest.run_id })))],
    ];
    for (const [name, attempt] of attempts) {
      const response = await attempt;
      expect([400, 404, 422], `${name}: ${response.status}`).toContain(response.status);
    }
  });

  it("cannot be stored under row-level security", async () => {
    const client = await runtime.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('evals.actor_id',$1,true),set_config('evals.org_id',$2,true)", [userId, orgId]);
      await expect(client.query("INSERT INTO evals.report(id,org_id,project_id,title) VALUES($1,$2,$3,'Example')", [latest.report_revision_id, orgId, randomUUID()])).rejects.toThrow(/uuid/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("leaves no trace that limits, credits, metrics or activation could count", async () => {
    const { getWorkspaceSummary } = await import("@/lib/evals/repositories/stage-c");
    const summary = await getWorkspaceSummary({ orgId, actorId: userId });
    expect(summary.evaluations).toEqual([]);
    expect(summary.reports).toEqual([]);
    const after = await footprint();
    expect(after).toEqual(before);
    for (const table of ["evals.evaluation", "evals.run", "evals.report", "public.product_analytics_event"]) expect(after[table], table).toBe(0);
  });
});
