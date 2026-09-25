import "server-only";
import { randomUUID } from "node:crypto";
import { canonicalJson } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import { boundedOutputTokens, invocationSchema } from "../providers/contracts";
import { digest, enqueueInvocation, type Tenant } from "../queue/store";
import { buildReportSnapshot, reportSnapshotSchema } from "../reports/contracts";
import { NARRATIVE_PROMPT_REVISION, evidencePacket, evidencePacketHash, narrativeSystemPrompt, validateNarrative } from "../reports/narrative";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

// Report narrative orchestration (spec §15.1). The deterministic report always
// exists first; a narrative is an optional budgeted DGX job whose validated
// takeaways become a new immutable revision. Publication stays a separate,
// explicit operator action.

export function requestReportNarrative(scope: EvidenceScope, reportId: string, reportRevisionId: string) {
  return withTenant(scope, async (db) => {
    const revision = (await db.query(`SELECT rr.id,rr.snapshot,e.commercial_cap,e.currency FROM evals.report_revision rr
      JOIN evals.run r ON (r.org_id,r.id)=(rr.org_id,rr.run_id) JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
      WHERE rr.org_id=$1 AND rr.id=$2 AND rr.report_id=$3`, [scope.orgId, reportRevisionId, reportId])).rows[0];
    if (!revision) throw new EvalError("SCOPE_DENIED", 404);
    const snapshot = reportSnapshotSchema.parse(revision.snapshot);
    const packetHash = evidencePacketHash(snapshot);
    const existing = (await db.query("SELECT id,status,reason_code FROM evals.report_narrative_job WHERE org_id=$1 AND report_revision_id=$2 AND evidence_packet_hash=$3",
      [scope.orgId, reportRevisionId, packetHash])).rows[0];
    if (existing) return existing;
    const route = (await db.query(`SELECT r.provider_revision_id,r.price_revision_id,r.data_class,r.region,r.internal_cost_per_second,p.adapter,p.output_limit,p.context_limit,pr.currency
      FROM evals.generation_provider_route r JOIN evals.provider_revision p ON p.id=r.provider_revision_id
      JOIN evals.price_revision pr ON (pr.id,pr.provider_revision_id)=(r.price_revision_id,r.provider_revision_id)
      WHERE r.org_id=$1 AND r.role='report_writer'`, [scope.orgId])).rows[0];
    const workspaceBudget = (await db.query("SELECT id,currency FROM evals.execution_budget WHERE org_id=$1 AND kind='workspace' AND scope_id=$1", [scope.orgId])).rows[0];
    const jobId = randomUUID();
    const skip = !route || route.adapter !== "dgx" ? "narrative_route_unavailable"
      : !workspaceBudget || workspaceBudget.currency !== route.currency || revision.currency !== route.currency ? "narrative_budget_unavailable" : null;
    if (skip) {
      // The deterministic takeaways remain; the reason is visible to operators.
      return (await db.query(`INSERT INTO evals.report_narrative_job(id,org_id,report_revision_id,evidence_packet_hash,writer_model_revision_id,writer_prompt_revision,status,reason_code,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'skipped',$7,$8) RETURNING id,status,reason_code`,
      [jobId, scope.orgId, reportRevisionId, packetHash, route?.provider_revision_id ?? randomUUID(), NARRATIVE_PROMPT_REVISION, skip, scope.actorId])).rows[0];
    }
    const passId = randomUUID(), workflowId = randomUUID();
    const runBudget = (await db.query("INSERT INTO evals.execution_budget(org_id,kind,scope_id,currency,ceiling) VALUES($1,'run',$2,$3,$4) RETURNING id",
      [scope.orgId, passId, revision.currency, revision.commercial_cap])).rows[0];
    const messages = [
      { role: "system" as const, content: narrativeSystemPrompt() },
      { role: "user" as const, content: canonicalJson(evidencePacket(snapshot)) },
    ];
    const invocation = invocationSchema.parse({
      probe: false, probeKind: "text", outputFormat: "json_object", narrativeJobId: jobId,
      providerRevisionId: route.provider_revision_id, priceRevisionId: route.price_revision_id,
      workspaceBudgetId: workspaceBudget.id, runBudgetId: runBudget.id, role: "report_writer",
      dataClass: route.data_class, region: route.region, routing: "local_only", approvedProviderIds: [],
      messages, maxOutputTokens: boundedOutputTokens(messages, route.context_limit, route.output_limit, 1024),
      timeoutMs: 600000, internalCostPerSecond: route.internal_cost_per_second,
    });
    await db.query(`INSERT INTO evals.report_narrative_job(id,org_id,report_revision_id,evidence_packet_hash,writer_model_revision_id,writer_prompt_revision,workflow_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [jobId, scope.orgId, reportRevisionId, packetHash, route.provider_revision_id, NARRATIVE_PROMPT_REVISION, workflowId, scope.actorId]);
    const stepId = await enqueueInvocation(db, scope as Tenant, { workflowId, runId: passId, planHash: digest({ reportRevisionId, packetHash }), kind: "grade", version: 1, input: invocation });
    await db.query("UPDATE evals.report_narrative_job SET step_id=$3,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, jobId, stepId]);
    return { id: jobId, status: "queued", reason_code: null };
  });
}

/** Validates finished narrative steps and saves accepted takeaways as a new report revision. */
export function advanceReportNarratives(scope: EvidenceScope, limit = 10) {
  return withTenant(scope, async (db) => {
    const jobs = (await db.query(`SELECT j.*, s.status AS step_status, s.reason_code AS step_reason, x.output, rr.snapshot, rr.report_id, rr.run_id, rr.review_status
      FROM evals.report_narrative_job j
      JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(j.org_id,j.report_revision_id)
      LEFT JOIN evals.workflow_step s ON (s.org_id,s.id)=(j.org_id,j.step_id)
      LEFT JOIN LATERAL (SELECT output FROM evals.execution_result r WHERE r.org_id=j.org_id AND r.step_id=j.step_id ORDER BY r.created_at DESC LIMIT 1) x ON true
      WHERE j.org_id=$1 AND j.status='queued' ORDER BY j.created_at LIMIT $2 FOR UPDATE OF j SKIP LOCKED`, [scope.orgId, limit])).rows;
    const result = { completed: 0, rejected: 0, failed: 0, pending: 0 };
    for (const job of jobs) {
      const finish = (status: string, reason: string | null, narrative: unknown = null, rejectedClaims: unknown = []) => db.query(
        "UPDATE evals.report_narrative_job SET status=$3,reason_code=$4,narrative=$5,rejected_claims=$6,updated_at=now() WHERE org_id=$1 AND id=$2",
        [scope.orgId, job.id, status, reason, narrative === null ? null : JSON.stringify(narrative), JSON.stringify(rejectedClaims)]);
      if (!job.output) {
        if (["failed", "paused", "canceled"].includes(job.step_status)) { await finish("failed", job.step_reason ?? `narrative_step_${job.step_status}`); result.failed++; }
        else result.pending++;
        continue;
      }
      const snapshot = reportSnapshotSchema.parse(job.snapshot);
      const validated = validateNarrative(job.output, snapshot);
      if (!validated.ok) { await finish("rejected", validated.reason); result.rejected++; continue; }
      if (!validated.accepted.length) { await finish("rejected", "no_supported_takeaways", null, validated.rejected); result.rejected++; continue; }
      const { content_hash: _hash, takeaways: _previous, ...rest } = snapshot;
      void _hash; void _previous;
      const revisionId = randomUUID();
      const next = buildReportSnapshot({
        ...rest,
        report_revision_id: revisionId,
        created_at: new Date().toISOString(),
        takeaways: validated.accepted,
        methodology: {
          ...snapshot.methodology,
          limitations: [...snapshot.methodology.limitations,
            `Executive takeaways were drafted by a model from the report's evidence packet and checked against its metrics and cited results${validated.rejected.length ? `; ${validated.rejected.length} unsupported draft claim${validated.rejected.length === 1 ? " was" : "s were"} rejected` : ""}.`],
        },
      });
      await db.query(`INSERT INTO evals.report_revision(id,org_id,report_id,run_id,content_hash,snapshot,review_status,supersedes_revision_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [revisionId, scope.orgId, job.report_id, job.run_id, next.content_hash, next, job.review_status, job.report_revision_id]);
      await finish("completed", null, { report_revision_id: revisionId, takeaways: validated.accepted }, validated.rejected);
      result.completed++;
    }
    return result;
  });
}

export function listReportNarratives(scope: EvidenceScope, reportId: string) {
  return withTenant(scope, async (db) => (await db.query(`SELECT j.id,j.report_revision_id,j.status,j.reason_code,j.narrative->>'report_revision_id' AS result_revision_id,
      jsonb_array_length(j.rejected_claims) AS rejected_count,j.created_at,j.updated_at
    FROM evals.report_narrative_job j JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(j.org_id,j.report_revision_id)
    WHERE j.org_id=$1 AND rr.report_id=$2 ORDER BY j.created_at DESC LIMIT 20`, [scope.orgId, reportId])).rows);
}
