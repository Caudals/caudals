import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";
import { canonicalJson, sha256, withContentHash } from "../contracts/hashing";
import { targetConfigSchema, type TargetConfig } from "../contracts/connectors";
import { caseSchema, rubricSchema, type CefCase } from "../contracts/cases";
import { observationSchema } from "../contracts/results";
import { gradeDeterministically } from "../scoring/deterministic";
import { candidateInputSchema } from "../contracts/projections";
import { toolFixtureSchema, type scenarioSchema } from "../contracts/scenarios";
import { assertWebsiteRecipeOrigin, websiteRecipeSchema } from "../contracts/browser";
import {
  browserDiscoverySchema,
  controlWorkflow,
  digest,
  enqueueBrowserDiscovery,
  enqueueTargetExecution,
} from "../queue/store";
import { idempotent, type EvidenceScope } from "./evidence";
import { withTenant } from "./db";
import { createRunnerJob } from "../private-runner/store";

function required<T>(value: T | undefined): T {
  if (!value) throw new EvalError("SCOPE_DENIED", 404);
  return value;
}

function connectionType(config: TargetConfig) {
  return config.kind;
}

export function assertWebsiteAuthorization(
  record: { scope: { endpoint?: string }; expires_at: Date | string } | null,
  endpoint: string,
) {
  if (!record || record.scope.endpoint !== endpoint || new Date(record.expires_at).getTime() <= Date.now()) {
    throw new EvalError("SCOPE_DENIED", 403, "Confirm your authority to test this website before connecting it.");
  }
}

export function recordWebsiteAuthorization(scope: EvidenceScope, projectId: string, targetId: string, key: string) {
  return withTenant(scope, (db) => idempotent(db, scope, `website-authorization/${targetId}`, key, { projectId, targetId }, async () => {
    const target = required((await db.query(
      `SELECT tr.document FROM evals.target t JOIN LATERAL (
       SELECT document FROM evals.target_revision x WHERE x.org_id=t.org_id AND x.target_id=t.id
       ORDER BY x.created_at DESC,x.id DESC LIMIT 1
       ) tr ON true WHERE t.org_id=$1 AND t.project_id=$2 AND t.id=$3`,
      [scope.orgId, projectId, targetId],
    )).rows[0]);
    const config = targetConfigSchema.parse(target.document);
    if (config.kind !== "website") throw new EvalError("INPUT_INVALID", 422, "This is not a website connection.");
    const result = (await db.query(
      `INSERT INTO evals.authorization_record(
        org_id,project_id,target_id,basis,scope,traffic_limit,expires_at
       ) VALUES($1,$2,$3,'workspace_member_attestation',$4,$5,now()+interval '90 days')
       RETURNING id,expires_at`,
      [scope.orgId, projectId, targetId,
        { endpoint: config.endpoint, activity: "connection_check_and_bounded_evaluation", adversarial: false },
        { requests_per_minute: Math.min(config.requests_per_minute, 6), concurrent_sessions: 1 },
      ],
    )).rows[0];
    return { id: result.id, expiresAt: result.expires_at, endpoint: config.endpoint };
  }));
}

export function getTargetConnectionKind(
  scope: EvidenceScope,
  targetRevisionId: string,
) {
  return withTenant(scope, async (db) => {
    const row = required(
      (
        await db.query(
          "SELECT document FROM evals.target_revision WHERE org_id=$1 AND id=$2",
          [scope.orgId, targetRevisionId],
        )
      ).rows[0],
    );
    return targetConfigSchema.parse(row.document).kind;
  });
}

export async function queueWebsiteConnectionCheck(
  scope: EvidenceScope,
  targetRevisionId: string,
  key: string,
) {
  return withTenant(scope, (db) =>
    idempotent(
      db,
      scope,
      `website-check/${targetRevisionId}`,
      key,
      {},
      async () => {
        const row = required(
          (
            await db.query(
              `SELECT tr.document,t.id AS target_id,t.project_id
               FROM evals.target_revision tr
               JOIN evals.target t ON (t.org_id,t.id)=(tr.org_id,tr.target_id)
               WHERE tr.org_id=$1 AND tr.id=$2`,
              [scope.orgId, targetRevisionId],
            )
          ).rows[0],
        );
        const config = targetConfigSchema.parse(row.document);
        if (config.kind !== "website") {
          throw new EvalError("INPUT_INVALID", 422, "This target is not a website connection.");
        }
        const authorization = (await db.query(
          `SELECT scope,expires_at FROM evals.authorization_record
           WHERE org_id=$1 AND project_id=$2 AND target_id=$3
             AND basis='workspace_member_attestation'
           ORDER BY created_at DESC,id DESC LIMIT 1`,
          [scope.orgId, row.project_id, row.target_id],
        )).rows[0] ?? null;
        assertWebsiteAuthorization(authorization, config.endpoint);
        const check = (
          await db.query(
            `INSERT INTO evals.connection_check(org_id,target_revision_id,status,probe_evidence)
             VALUES($1,$2,'queued',$3) RETURNING id,status,created_at`,
            [scope.orgId, targetRevisionId, { kind: "website_discovery" }],
          )
        ).rows[0];
        const candidate = (
          await db.query(
            `INSERT INTO evals.website_recipe_candidate(
               org_id,project_id,target_id,target_revision_id,connection_check_id,source,status
             ) VALUES($1,$2,$3,$4,$5,'known_recipe','queued') RETURNING id,status`,
            [
              scope.orgId,
              row.project_id,
              row.target_id,
              targetRevisionId,
              check.id,
            ],
          )
        ).rows[0];
        const workflowId = randomUUID();
        const input = browserDiscoverySchema.parse({
          kind: "website_discovery",
          targetRevisionId,
          connectionCheckId: check.id,
          candidateId: candidate.id,
          timeoutMs: Math.min(config.limits.timeout_ms, 120_000),
          destinationPolicyId: "browser-public-https-v1",
        });
        const planHash = digest({
          targetRevisionId,
          connectionCheckId: check.id,
          input,
        });
        await enqueueBrowserDiscovery(db, scope, {
          workflowId,
          targetRevisionId,
          planHash,
          version: 1,
          input,
        });
        return {
          id: check.id,
          status: "queued",
          candidateId: candidate.id,
          workflowId,
        };
      },
    ),
  );
}

export function submitWebsiteRecipe(
  scope: EvidenceScope,
  targetRevisionId: string,
  input: { candidateId: string; recipe: unknown; source: "model_proposed" | "operator_authored" },
  key: string,
) {
  const recipe = websiteRecipeSchema.parse(input.recipe);
  return withTenant(scope, (db) =>
    idempotent(
      db,
      scope,
      `website-recipe/${targetRevisionId}`,
      key,
      { ...input, recipe },
      async () => {
        const target = required((await db.query(
          "SELECT document FROM evals.target_revision WHERE org_id=$1 AND id=$2",
          [scope.orgId, targetRevisionId],
        )).rows[0]);
        const config = targetConfigSchema.parse(target.document);
        if (config.kind !== "website") throw new EvalError("INPUT_INVALID", 422, "This is not a website connection.");
        try { assertWebsiteRecipeOrigin(recipe.start_url, config.endpoint); }
        catch { throw new EvalError("INPUT_INVALID", 422, "The recipe must start on the authorized website origin."); }
        const candidate = required(
          (
            await db.query(
              `UPDATE evals.website_recipe_candidate
               SET source=$4,document=$5,status='queued',reason_code=NULL,updated_at=now()
               WHERE org_id=$1 AND id=$2 AND target_revision_id=$3
                 AND status IN ('needs_operator','failed','queued')
               RETURNING *`,
              [scope.orgId, input.candidateId, targetRevisionId, input.source, recipe],
            )
          ).rows[0],
        );
        const workflowId = randomUUID();
        const job = browserDiscoverySchema.parse({
          kind: "website_discovery",
          targetRevisionId,
          connectionCheckId: candidate.connection_check_id,
          candidateId: candidate.id,
          timeoutMs: 60_000,
          destinationPolicyId: "browser-public-https-v1",
        });
        await enqueueBrowserDiscovery(db, scope, {
          workflowId,
          targetRevisionId,
          planHash: digest({ targetRevisionId, recipe: recipe.content_hash }),
          version: 1,
          input: job,
        });
        return { candidateId: candidate.id, workflowId, status: "queued" };
      },
    ),
  );
}

async function entitlement(db: PoolClient, orgId: string) {
  return required(
    (
      await db.query(
        "SELECT * FROM evals.lock_workspace_entitlement($1)",
        [orgId],
      )
    ).rows[0],
  );
}

export function assertApprovedRunSelection(
  evaluation: { preparation_status: string; selected_suite_version_id: string | null },
  requestedSuiteVersionId?: string,
) {
  if (evaluation.preparation_status !== "ready" || !evaluation.selected_suite_version_id) {
    throw new EvalError("INPUT_INVALID", 409, "Approve the prepared test set before starting a run.");
  }
  if (requestedSuiteVersionId && requestedSuiteVersionId !== evaluation.selected_suite_version_id) {
    throw new EvalError("SCOPE_DENIED", 403, "This test set is not approved for the evaluation.");
  }
}

export function assertReadyConnection(
  kind: string,
  check: { status: string } | null,
  recipe: { id: string } | null,
) {
  if (kind === "website" ? !recipe : check?.status !== "ready") {
    throw new EvalError("CONNECTION_UNSUPPORTED", 409, "The connection is not ready. Request setup assistance or retry its check.");
  }
}

export function assertOperatorRecipeAuthority(role: "platform_admin" | "operator" | null) {
  if (role !== "platform_admin" && role !== "operator") {
    throw new EvalError("SCOPE_DENIED", 403, "Website recipes require operator review.");
  }
}

export function approvePreparedSuite(scope: EvidenceScope, evaluationId: string, suiteVersionId: string, key: string) {
  return withTenant(scope, (db) => idempotent(db, scope, `approve-suite/${evaluationId}`, key, { suiteVersionId }, async () => {
    const evaluation = required((await db.query(
      "SELECT id,project_id,preparation_status,selected_suite_version_id FROM evals.evaluation WHERE org_id=$1 AND id=$2 FOR UPDATE",
      [scope.orgId, evaluationId],
    )).rows[0]);
    if (evaluation.preparation_status === "ready" && evaluation.selected_suite_version_id === suiteVersionId) {
      return { evaluationId, suiteVersionId, status: "ready" };
    }
    if (evaluation.preparation_status !== "needs_review") {
      throw new EvalError("INPUT_INVALID", 409, "The test set is not ready for approval.");
    }
    const suite = (await db.query(
      `SELECT sv.id FROM evals.suite_version sv
       JOIN evals.suite s ON (s.org_id,s.id)=(sv.org_id,sv.suite_id)
       JOIN evals.generation_batch b ON b.org_id=sv.org_id
         AND b.evaluation_id=$2 AND b.status='completed'
         AND b.output->>'suiteId'=s.id::text
         AND b.output->>'suiteVersionId'=sv.id::text
         AND b.id=(SELECT x.id FROM evals.generation_batch x
           WHERE x.org_id=$1 AND x.evaluation_id=$2 AND x.status='completed'
           ORDER BY x.created_at DESC,x.id DESC LIMIT 1)
       WHERE sv.org_id=$1 AND sv.id=$3 AND s.project_id=$4
         AND jsonb_array_length(sv.manifest->'source_revisions')>0
         AND jsonb_array_length(sv.manifest->'case_revisions')>0`,
      [scope.orgId, evaluationId, suiteVersionId, evaluation.project_id],
    )).rows[0];
    if (!suite) throw new EvalError("SCOPE_DENIED", 404, "The frozen test set does not belong to this preparation.");
    await db.query(
      `UPDATE evals.evaluation SET selected_suite_version_id=$3,preparation_status='ready',
       reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2`,
      [scope.orgId, evaluationId, suiteVersionId],
    );
    return { evaluationId, suiteVersionId, status: "ready" };
  }));
}

async function monthlySpend(db: PoolClient, orgId: string) {
  const row = (
    await db.query(
      `SELECT
         (SELECT COALESCE(sum(c.amount),0) FROM evals.execution_cost_entry c
          WHERE c.org_id=$1 AND c.created_at>=date_trunc('month',now()))::text AS settled,
         (SELECT COALESCE(sum(r.amount),0) FROM evals.budget_reservation r
          WHERE r.org_id=$1 AND r.state IN ('reserved','unresolved')
            AND r.created_at>=date_trunc('month',now()))::text AS outstanding`,
      [orgId],
    )
  ).rows[0];
  return { settled: row.settled as string, outstanding: row.outstanding as string };
}

export function getWorkspaceSummary(scope: EvidenceScope) {
  return withTenant(scope, async (db) => {
    const [limits, usage] = await Promise.all([
      entitlement(db, scope.orgId),
      monthlySpend(db, scope.orgId),
    ]);
    const evaluations = (
      await db.query(
        `SELECT e.*,p.title AS project_title,p.description AS project_description,
          COALESCE((SELECT array_agg(s.id ORDER BY s.created_at,s.id) FROM evals.source s WHERE s.org_id=e.org_id AND s.evaluation_id=e.id),ARRAY[]::uuid[]) AS source_ids,
          (SELECT sr.source_id FROM evals.source_revision sr JOIN evals.source s ON (s.org_id,s.id)=(sr.org_id,sr.source_id) WHERE sr.org_id=e.org_id AND s.project_id=e.project_id ORDER BY sr.created_at DESC,sr.id DESC LIMIT 1) AS latest_source_id,
          (SELECT sr.id FROM evals.source_revision sr JOIN evals.source s ON (s.org_id,s.id)=(sr.org_id,sr.source_id) WHERE sr.org_id=e.org_id AND s.project_id=e.project_id ORDER BY sr.created_at DESC,sr.id DESC LIMIT 1) AS latest_source_revision_id,
          (SELECT r.id FROM evals.run r WHERE r.org_id=e.org_id AND r.evaluation_id=e.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS latest_run_id,
          (SELECT r.status FROM evals.run r WHERE r.org_id=e.org_id AND r.evaluation_id=e.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS latest_run_status,
          (SELECT r.phase FROM evals.run r WHERE r.org_id=e.org_id AND r.evaluation_id=e.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS latest_run_phase
         FROM evals.evaluation e
         JOIN evals.project p ON (p.org_id,p.id)=(e.org_id,e.project_id)
         WHERE e.org_id=$1 ORDER BY e.updated_at DESC,e.id LIMIT 100`,
        [scope.orgId],
      )
    ).rows;
    const systems = (
      await db.query(
        `SELECT t.id,t.project_id,t.title,tr.id AS target_revision_id,tr.document,
          cc.status AS connection_status,cc.error_code,cc.capability_report,ri.id AS runner_id,
          CASE WHEN tr.document->>'kind'='private_runner' THEN
            CASE WHEN ri.id IS NULL THEN 'pairing_required'
                 WHEN ri.revoked_at IS NOT NULL THEN 'revoked'
                 WHEN ri.token_expires_at<=now() THEN 'token_expired'
                 WHEN ri.last_seen_at>now()-interval '15 minutes' THEN 'connected'
                 ELSE 'paired' END
            ELSE NULL END AS runner_status
         FROM evals.target t
         JOIN LATERAL (
           SELECT * FROM evals.target_revision x
           WHERE x.org_id=t.org_id AND x.target_id=t.id
           ORDER BY x.created_at DESC,x.id DESC LIMIT 1
         ) tr ON true
         LEFT JOIN LATERAL (
           SELECT * FROM evals.connection_check x
           WHERE x.org_id=tr.org_id AND x.target_revision_id=tr.id
           ORDER BY x.created_at DESC,x.id DESC LIMIT 1
         ) cc ON true
         LEFT JOIN evals.runner_identity ri ON ri.org_id=t.org_id AND ri.target_id=t.id
           AND ri.id::text=tr.document->>'runner_id'
         WHERE t.org_id=$1 ORDER BY t.created_at DESC,t.id LIMIT 100`,
        [scope.orgId],
      )
    ).rows;
    const reports = (
      await db.query(
        `SELECT rp.id,rp.title,rp.current_revision_id,rp.publication_status,rp.updated_at,
                r.evaluation_id
         FROM evals.report rp
         JOIN evals.report_revision rr
           ON (rr.org_id,rr.id)=(rp.org_id,rp.current_revision_id)
         JOIN evals.run r ON (r.org_id,r.id)=(rr.org_id,rr.run_id)
         WHERE rp.org_id=$1 AND rp.publication_status='published'
         ORDER BY rp.updated_at DESC,rp.id LIMIT 100`,
        [scope.orgId],
      )
    ).rows;
    const preferences = (
      await db.query(
        `SELECT completion,required_input,failure,email
         FROM evals.notification_preference WHERE org_id=$1 AND user_id=$2`,
        [scope.orgId, scope.actorId],
      )
    ).rows[0] ?? { completion: true, required_input: true, failure: true, email: false };
    return { evaluations, systems, reports, entitlement: limits, usage, preferences };
  });
}

export function setNotificationPreferences(
  scope: EvidenceScope,
  input: { completion: boolean; requiredInput: boolean; failure: boolean; email: boolean },
) {
  return withTenant(scope, async (db) =>
    (
      await db.query(
        `INSERT INTO evals.notification_preference(
           org_id,user_id,completion,required_input,failure,email
         ) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(org_id,user_id) DO UPDATE SET
           completion=EXCLUDED.completion,
           required_input=EXCLUDED.required_input,
           failure=EXCLUDED.failure,
           email=EXCLUDED.email,
           updated_at=now()
         RETURNING completion,required_input AS "requiredInput",failure,email,updated_at`,
        [
          scope.orgId,
          scope.actorId,
          input.completion,
          input.requiredInput,
          input.failure,
          input.email,
        ],
      )
    ).rows[0],
  );
}

function supportsCase(
  config: TargetConfig,
  requiredCapabilities: string[],
  capabilityReport: unknown,
) {
  const report = capabilityReport as
    | { features?: Array<{ capability: string; status: string }> }
    | null;
  const statuses = new Map(
    (report?.features ?? []).map((item) => [item.capability, item.status]),
  );
  if (requiredCapabilities.some((capability) => statuses.get(capability) === "unsupported")) {
    return false;
  }
  if (config.kind === "https_json" && requiredCapabilities.some((item) => item === "tool_calls")) {
    return false;
  }
  return true;
}

export const selfServiceRunInputSchema = z.strictObject({
  evaluationId: z.uuid(),
  targetRevisionId: z.uuid().optional(),
  suiteVersionId: z.uuid().optional(),
});

export function createSelfServiceRun(
  scope: EvidenceScope,
  raw: unknown,
  key: string,
) {
  const input = selfServiceRunInputSchema.parse(raw);
  return withTenant(scope, (db) =>
    idempotent(db, scope, "self-service-runs", key, input, async () => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`self-service-runs:${scope.orgId}`]);
      const limits = required((await db.query(
        "SELECT * FROM evals.workspace_entitlement WHERE org_id=$1",
        [scope.orgId],
      )).rows[0]);
      const active = Number(
        (
          await db.query(
            `SELECT count(*)::int AS count FROM evals.run
             WHERE org_id=$1 AND status IN ('queued','running','pause_requested','paused','cancel_requested')`,
            [scope.orgId],
          )
        ).rows[0].count,
      );
      if (active >= limits.max_active_runs) {
        throw new EvalError("SCOPE_DENIED", 409, "The workspace active-run allowance is in use.");
      }
      const usage = await monthlySpend(db, scope.orgId);
      if (Number(usage.settled) + Number(usage.outstanding) >= Number(limits.monthly_spend_limit)) {
        throw new EvalError("BUDGET_PAUSED", 409, "The agreed monthly limit has been reached.");
      }
      const evaluation = required(
        (
          await db.query(
            "SELECT * FROM evals.evaluation WHERE org_id=$1 AND id=$2 FOR UPDATE",
            [scope.orgId, input.evaluationId],
          )
        ).rows[0],
      );
      assertApprovedRunSelection(evaluation, input.suiteVersionId);
      const target = required(
        (
          await db.query(
            `SELECT tr.*,t.project_id,t.id AS target_id
             FROM evals.target_revision tr
             JOIN evals.target t ON (t.org_id,t.id)=(tr.org_id,tr.target_id)
             WHERE tr.org_id=$1 AND t.project_id=$2
               AND ($3::uuid IS NULL OR tr.id=$3)
             ORDER BY (tr.document->>'recipe_revision_id' IS NOT NULL) DESC,tr.created_at DESC,tr.id DESC LIMIT 1`,
            [
              scope.orgId,
              evaluation.project_id,
              input.targetRevisionId ?? evaluation.selected_target_revision_id ?? null,
            ],
          )
        ).rows[0],
      );
      const config = targetConfigSchema.parse(target.document);
      if (!limits.allowed_connection_types.includes(connectionType(config))) {
        throw new EvalError("SCOPE_DENIED", 403, "This connection type is not enabled for the workspace.");
      }
      if (config.kind === "website" && !config.recipe_revision_id) {
        throw new EvalError("CONNECTION_UNSUPPORTED", 409, "This website needs connection assistance before it can run.");
      }
      if (config.kind === "website") {
        const authorization = (await db.query(
          `SELECT scope,expires_at FROM evals.authorization_record
           WHERE org_id=$1 AND project_id=$2 AND target_id=$3
             AND basis='workspace_member_attestation'
           ORDER BY created_at DESC,id DESC LIMIT 1`,
          [scope.orgId, evaluation.project_id, target.target_id],
        )).rows[0] ?? null;
        assertWebsiteAuthorization(authorization, config.endpoint);
      }
      const connectionCheck = (await db.query(
        `SELECT status,capability_report FROM evals.connection_check
         WHERE org_id=$1 AND target_revision_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,
        [scope.orgId, target.id],
      )).rows[0] ?? null;
      const recipe = config.kind === "website" && config.recipe_revision_id
        ? (await db.query(
            `SELECT id FROM evals.website_recipe_revision
             WHERE org_id=$1 AND id=$2 AND target_id=$3`,
            [scope.orgId, config.recipe_revision_id, target.target_id],
          )).rows[0] ?? null
        : null;
      if (config.kind !== "imported_responses" && config.kind !== "private_runner") assertReadyConnection(config.kind, connectionCheck, recipe);
      const suite = required(
        (
          await db.query(
            `SELECT sv.*,s.project_id
             FROM evals.suite_version sv
             JOIN evals.suite s ON (s.org_id,s.id)=(sv.org_id,sv.suite_id)
             WHERE sv.org_id=$1 AND s.project_id=$2
               AND ($3::uuid IS NULL OR sv.id=$3)
             ORDER BY sv.created_at DESC,sv.id DESC LIMIT 1`,
            [
              scope.orgId,
              evaluation.project_id,
              evaluation.selected_suite_version_id,
            ],
          )
        ).rows[0],
      );
      const rows = (
        await db.query(
          `SELECT sc.case_revision_id,cr.document
           FROM evals.suite_case sc
           JOIN evals.case_revision cr ON (cr.org_id,cr.id)=(sc.org_id,sc.case_revision_id)
           WHERE sc.org_id=$1 AND sc.suite_version_id=$2 ORDER BY sc.ordinal`,
          [scope.orgId, suite.id],
        )
      ).rows;
      if (!rows.length) throw new EvalError("INPUT_INVALID", 422, "The test set is empty.");
      if (config.kind === "private_runner") {
        if (suite.manifest.execution_mode === "imported_responses")
          throw new EvalError("INPUT_INVALID",422,"The approved test set is for collected answers.");
        const runId=randomUUID();
        const plan=withContentHash({run_id:runId,target_revision_id:target.id,
          target_config_hash:target.content_hash,suite_version_id:suite.id,
          case_revisions:rows.map(row=>({revision_id:row.case_revision_id,content_hash:row.document.content_hash,family_id:row.document.family_id})),
          execution_mode:"deployed_system",execution_transport:"customer_private_runner",
          candidate_context_hash:sha256(canonicalJson({visibility:"candidate",suite:suite.content_hash})),
          repetition_policy:"frozen_case_limits",execution_conditions_hash:sha256(canonicalJson(config))});
        await db.query(`INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase,reason_code)
          VALUES($1,$2,$3,$4,$5,'deployed_system','paused','target_execution','runner_wait')`,
          [runId,scope.orgId,evaluation.id,target.id,suite.id]);
        await db.query("INSERT INTO evals.run_plan(org_id,run_id,content_hash,document) VALUES($1,$2,$3,$4)",
          [scope.orgId,runId,plan.content_hash,plan]);
        const job=await createRunnerJob(db,scope,{runnerId:config.runner_id,connectorVersion:config.connector_version,projectId:evaluation.project_id,
          targetId:target.target_id,targetRevisionId:target.id,runId,suiteVersionId:suite.id,rows});
        await db.query(`UPDATE evals.evaluation SET selected_target_revision_id=$3,
          selected_suite_version_id=$4,preparation_status='ready',updated_at=now() WHERE org_id=$1 AND id=$2`,
          [scope.orgId,evaluation.id,target.id,suite.id]);
        return {id:runId,workflowId:null,status:"awaiting_private_runner",units:job.units,
          queued:0,excluded:0,planHash:plan.content_hash,runnerJobId:job.jobId};
      }
      if (config.kind === "imported_responses") {
        if (suite.manifest.execution_mode !== "imported_responses") {
          throw new EvalError("INPUT_INVALID", 422, "The approved test set is not for collected answers.");
        }
        if (rows.some((row) => caseSchema.parse(row.document).limits.repetitions !== 1)) {
          throw new EvalError("INPUT_INVALID", 422, "Collected answers require one response per question.");
        }
        const runId = randomUUID();
        const plan = withContentHash({
          run_id: runId,
          target_revision_id: target.id,
          target_config_hash: target.content_hash,
          suite_version_id: suite.id,
          case_revisions: rows.map((row) => ({ revision_id: row.case_revision_id, content_hash: row.document.content_hash })),
          execution_mode: "imported_responses",
          collection_policy: "customer_supplied_case_revision_matched",
        });
        await db.query(
          `INSERT INTO evals.run(id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase)
           VALUES($1,$2,$3,$4,$5,'imported_responses','paused','preflight')`,
          [runId, scope.orgId, evaluation.id, target.id, suite.id],
        );
        await db.query("INSERT INTO evals.run_plan(org_id,run_id,content_hash,document) VALUES($1,$2,$3,$4)", [scope.orgId, runId, plan.content_hash, plan]);
        for (const row of rows) {
          await db.query("INSERT INTO evals.case_unit(id,org_id,run_id,case_revision_id,repetition,status) VALUES($1,$2,$3,$4,0,'pending')", [randomUUID(), scope.orgId, runId, row.case_revision_id]);
        }
        await db.query(
          "UPDATE evals.evaluation SET selected_target_revision_id=$3,updated_at=now() WHERE org_id=$1 AND id=$2",
          [scope.orgId, evaluation.id, target.id],
        );
        return { id: runId, workflowId: null, status: "awaiting_answers", units: rows.length, queued: 0, excluded: 0, planHash: plan.content_hash };
      }
      if (suite.manifest.execution_mode === "imported_responses") {
        throw new EvalError("INPUT_INVALID", 422, "The approved test set requires collected answers.");
      }
      const capability = connectionCheck?.status === "ready" ? connectionCheck.capability_report : null;
      const fixtureRows = suite.manifest.fixture_revisions?.length
        ? (
            await db.query(
              `SELECT document FROM evals.tool_fixture_revision
               WHERE org_id=$1 AND id=ANY($2::uuid[])`,
              [
                scope.orgId,
                suite.manifest.fixture_revisions.map(
                  (item: { revision_id: string }) => item.revision_id,
                ),
              ],
            )
          ).rows
        : [];
      const fixtures = fixtureRows.map((row) => toolFixtureSchema.parse(row.document));
      const runId = randomUUID();
      const workflowId = randomUUID();
      const plan = withContentHash({
        run_id: runId,
        target_revision_id: target.id,
        target_config_hash: target.content_hash,
        suite_version_id: suite.id,
        case_revisions: rows.map((row) => ({
          revision_id: row.case_revision_id,
          content_hash: row.document.content_hash,
          family_id: row.document.family_id,
        })),
        execution_mode: "deployed_system",
        candidate_context_hash: sha256(canonicalJson({ visibility: "candidate", suite: suite.content_hash })),
        tool_fixture_hashes: fixtures.map((fixture) => fixture.content_hash),
        repetition_policy: "frozen_case_limits",
        execution_conditions_hash: sha256(canonicalJson(config)),
      });
      await db.query(
        `INSERT INTO evals.run(
           id,org_id,evaluation_id,target_revision_id,suite_version_id,execution_mode,status,phase
         ) VALUES($1,$2,$3,$4,$5,'deployed_system','queued','preflight')`,
        [runId, scope.orgId, evaluation.id, target.id, suite.id],
      );
      await db.query(
        "INSERT INTO evals.run_plan(org_id,run_id,content_hash,document) VALUES($1,$2,$3,$4)",
        [scope.orgId, runId, plan.content_hash, plan],
      );
      let queued = 0;
      let excluded = 0;
      for (const row of rows) {
        const item = caseSchema.parse(row.document);
        const fixture = item.scenario.tool_fixture_set_id
          ? fixtures.find(
              (candidate) => candidate.fixture_set_id === item.scenario.tool_fixture_set_id,
            ) ?? null
          : null;
        const candidate = candidateInputSchema.parse({
          schema_version: "1.0",
          case_id: item.case_id,
          case_revision_id: item.revision_id,
          messages: item.scenario.messages,
          attachments: item.scenario.attachments,
          tools: fixture?.tools ?? [],
        });
        for (let repetition = 0; repetition < item.limits.repetitions; repetition += 1) {
          const caseUnitId = randomUUID();
          const supported = supportsCase(
            config,
            item.scenario.required_capabilities,
            capability,
          );
          await db.query(
            `INSERT INTO evals.case_unit(
               id,org_id,run_id,case_revision_id,repetition,status,reason_code
             ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              caseUnitId,
              scope.orgId,
              runId,
              item.revision_id,
              repetition,
              supported ? "queued" : "unsupported",
              supported ? null : "capability_missing",
            ],
          );
          if (!supported) {
            excluded += 1;
            continue;
          }
          await enqueueTargetExecution(db, scope, {
            workflowId,
            runId,
            planHash: plan.content_hash,
            version: 1,
            queue: config.kind === "website" ? "execute_browser" : "execute_api",
            input: {
              kind: "target_execution",
              runId,
              caseUnitId,
              caseRevisionId: item.revision_id,
              targetRevisionId: target.id,
              repetition,
              candidateInput: candidate,
              scenario: item.scenario,
              toolFixture: fixture,
              timeoutMs: Math.min(item.limits.timeout_ms, config.limits.timeout_ms, 120_000),
              destinationPolicyId:
                config.kind === "website"
                  ? "browser-public-https-v1"
                  : "public-https-v1",
            },
          });
          queued += 1;
        }
      }
      await db.query(
        `UPDATE evals.evaluation SET
           selected_target_revision_id=$3,selected_suite_version_id=$4,
           preparation_status='ready',updated_at=now()
         WHERE org_id=$1 AND id=$2`,
        [scope.orgId, evaluation.id, target.id, suite.id],
      );
      if (!queued) {
        await db.query(
          "UPDATE evals.run SET status='partial',phase='grading',reason_code='capability_missing' WHERE org_id=$1 AND id=$2",
          [scope.orgId, runId],
        );
      }
      return {
        id: runId,
        workflowId: queued ? workflowId : null,
        status: queued ? "queued" : "partial",
        units: queued + excluded,
        queued,
        excluded,
        planHash: plan.content_hash,
      };
    }),
  );
}

export function controlRun(
  scope: EvidenceScope,
  runId: string,
  action: "pause" | "resume" | "cancel",
) {
  return withTenant(scope, async (db) => {
    const workflow = (
      await db.query(
        "SELECT id,status FROM evals.execution_workflow WHERE org_id=$1 AND run_id=$2",
        [scope.orgId, runId],
      )
    ).rows[0];
    if (!workflow) {
      const job = (
        await db.query(
          "SELECT id FROM evals.runner_job WHERE org_id=$1 AND run_id=$2 FOR UPDATE",
          [scope.orgId, runId],
        )
      ).rows[0];
      if (job) {
        if (action !== "cancel") {
          throw new EvalError("CONNECTION_UNSUPPORTED", 422, "Private runner jobs can only be canceled here.");
        }
        await db.query(
          "UPDATE evals.runner_job SET status='canceled' WHERE org_id=$1 AND id=$2 AND status IN ('ready','claimed')",
          [scope.orgId, job.id],
        );
        await db.query(
          "UPDATE evals.case_unit SET status='canceled',reason_code='runner_canceled',updated_at=now() WHERE org_id=$1 AND run_id=$2 AND status='pending'",
          [scope.orgId, runId],
        );
        await db.query(`UPDATE evals.run SET status=CASE WHEN EXISTS(
          SELECT 1 FROM evals.case_unit cu WHERE cu.org_id=$1 AND cu.run_id=$2 AND cu.status='succeeded'
        ) THEN 'partial' ELSE 'canceled' END,reason_code='runner_canceled',updated_at=now()
          WHERE org_id=$1 AND id=$2`, [scope.orgId, runId]);
        return { runId, action };
      }

      const importedRun = (
        await db.query(
          "SELECT execution_mode,status FROM evals.run WHERE org_id=$1 AND id=$2 FOR UPDATE",
          [scope.orgId, runId],
        )
      ).rows[0];
      if (!importedRun || importedRun.execution_mode !== "imported_responses") {
        throw new EvalError("SCOPE_DENIED", 404, "This action is not available.");
      }
      if (action !== "cancel") {
        throw new EvalError("SCOPE_DENIED", 409, "Imported-answer runs without a worker can only be canceled.");
      }
      const activeStatuses = ["queued", "running", "pause_requested", "paused", "cancel_requested"];
      if (!activeStatuses.includes(importedRun.status)) {
        return { runId, action, status: importedRun.status };
      }
      const running = Number((await db.query(
        "SELECT count(*)::int AS count FROM evals.case_unit WHERE org_id=$1 AND run_id=$2 AND status='running'",
        [scope.orgId, runId],
      )).rows[0].count);
      if (running > 0) {
        throw new EvalError("SCOPE_DENIED", 409, "Wait for the imported answer to finish saving, then cancel the run.");
      }
      const hasCompletedAnswers = Boolean((await db.query(
        "SELECT EXISTS(SELECT 1 FROM evals.case_unit WHERE org_id=$1 AND run_id=$2 AND status IN ('succeeded','unknown_external_outcome')) AS value",
        [scope.orgId, runId],
      )).rows[0].value);
      const status = hasCompletedAnswers ? "partial" : "canceled";
      await db.query(
        "UPDATE evals.case_unit SET status='canceled',reason_code='run_canceled',updated_at=now() WHERE org_id=$1 AND run_id=$2 AND status IN ('pending','queued')",
        [scope.orgId, runId],
      );
      await db.query(
        "UPDATE evals.run SET status=$3,phase='done',reason_code='run_canceled',updated_at=now() WHERE org_id=$1 AND id=$2",
        [scope.orgId, runId, status],
      );
      await db.query(
        "INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'run.canceled',$3)",
        [scope.orgId, scope.actorId, runId],
      );
      return { runId, action, status };
    }
    await controlWorkflow(db, scope.orgId, workflow.id, action);
    if (action === "cancel" && !["completed", "partial", "failed"].includes(workflow.status)) {
      await db.query(
        "UPDATE evals.case_unit SET status='canceled',reason_code='run_canceled',updated_at=now() WHERE org_id=$1 AND run_id=$2 AND status IN ('pending','queued')",
        [scope.orgId, runId],
      );
      await db.query(
        `UPDATE evals.run SET
          status=CASE WHEN EXISTS(
            SELECT 1 FROM evals.case_unit cu WHERE cu.org_id=$1 AND cu.run_id=$2 AND cu.status='running'
          ) THEN 'cancel_requested'
          WHEN EXISTS(
            SELECT 1 FROM evals.case_unit cu WHERE cu.org_id=$1 AND cu.run_id=$2 AND cu.status IN ('succeeded','unknown_external_outcome')
          ) THEN 'partial' ELSE 'canceled' END,
          phase=CASE WHEN EXISTS(
            SELECT 1 FROM evals.case_unit cu WHERE cu.org_id=$1 AND cu.run_id=$2 AND cu.status='running'
          ) THEN phase ELSE 'done' END,
          reason_code='run_canceled',updated_at=now()
          WHERE org_id=$1 AND id=$2 AND status NOT IN ('completed','partial','failed')`,
        [scope.orgId, runId],
      );
    }
    return { runId, action };
  });
}

export function forkSuite(
  scope: EvidenceScope,
  sourceSuiteId: string,
  suiteVersionId: string,
  title: string,
  key: string,
) {
  return withTenant(scope, (db) =>
    idempotent(
      db,
      scope,
      `suite-fork/${suiteVersionId}`,
      key,
      { title },
      async () => {
        const original = required(
          (
            await db.query(
              `SELECT sv.manifest,s.project_id
               FROM evals.suite_version sv
               JOIN evals.suite s ON (s.org_id,s.id)=(sv.org_id,sv.suite_id)
               WHERE sv.org_id=$1 AND sv.id=$2 AND sv.suite_id=$3`,
              [scope.orgId, suiteVersionId, sourceSuiteId],
            )
          ).rows[0],
        );
        const suiteId = randomUUID();
        const nextVersionId = randomUUID();
        const draft = withContentHash({
          ...original.manifest,
          suite_id: suiteId,
          suite_version_id: nextVersionId,
          title,
          created_at: new Date().toISOString(),
          extensions: {
            ...(original.manifest.extensions ?? {}),
            "caudals.evals/fork": { source_suite_version_id: suiteVersionId },
          },
        });
        await db.query(
          "INSERT INTO evals.suite(id,org_id,project_id,title,draft) VALUES($1,$2,$3,$4,$5)",
          [suiteId, scope.orgId, original.project_id, title, draft],
        );
        return { suiteId, draftVersion: 1, proposedSuiteVersionId: nextVersionId };
      },
    ),
  );
}

export function assertRegressionEligible(source: { execution_status: string; latest_outcome: string | null }) {
  if (source.execution_status !== "succeeded" || !["fail", "partial"].includes(source.latest_outcome ?? "")) {
    throw new EvalError("INPUT_INVALID", 409, "Only a scored, failed or partially failed interaction can become a regression draft.");
  }
}

export function createRegressionDraft(
  scope: EvidenceScope,
  observationId: string,
) {
  return withTenant(scope, async (db) => {
    const source = required(
      (
        await db.query(
          `SELECT o.id,o.execution_status,cu.case_revision_id,e.project_id,
                  assessment.outcome AS latest_outcome
           FROM evals.observation o
           JOIN evals.case_unit cu ON (cu.org_id,cu.id)=(o.org_id,o.case_unit_id)
           JOIN evals.run r ON (r.org_id,r.id)=(o.org_id,o.run_id)
           JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
           LEFT JOIN LATERAL (
             SELECT outcome FROM evals.assessment a
             WHERE a.org_id=o.org_id AND a.observation_id=o.id
             ORDER BY a.created_at DESC,a.id DESC LIMIT 1
           ) assessment ON true
           WHERE o.org_id=$1 AND o.id=$2`,
          [scope.orgId, observationId],
        )
      ).rows[0],
    );
    assertRegressionEligible(source);
    const inserted = await db.query(
      "INSERT INTO evals.regression_case(org_id,project_id,source_observation_id,source_case_revision_id) " +
      "VALUES($1,$2,$3,$4) ON CONFLICT(org_id,source_observation_id) DO NOTHING " +
      "RETURNING id,redaction_status,validation_status",
      [scope.orgId, source.project_id, source.id, source.case_revision_id],
    );
    if (inserted.rows[0]) return inserted.rows[0];
    return required((await db.query(
      "SELECT id,redaction_status,validation_status FROM evals.regression_case " +
      "WHERE org_id=$1 AND source_observation_id=$2",
      [scope.orgId, source.id],
    )).rows[0]);
  });
}

export function getRegressionDraft(scope: EvidenceScope, regressionId: string) {
  return withTenant(scope, async (db) => required((await db.query(
    `SELECT rc.id,rc.project_id,rc.source_observation_id,rc.source_case_revision_id,
            rc.draft_case_revision_id,rc.redaction_status,rc.validation_status,
            source.document AS source_case,observation.document AS failed_observation,
            revised.document AS released_case
     FROM evals.regression_case rc
     JOIN evals.case_revision source ON (source.org_id,source.id)=(rc.org_id,rc.source_case_revision_id)
     JOIN evals.observation observation ON (observation.org_id,observation.id)=(rc.org_id,rc.source_observation_id)
     LEFT JOIN evals.case_revision revised ON (revised.org_id,revised.id)=(rc.org_id,rc.draft_case_revision_id)
     WHERE rc.org_id=$1 AND rc.id=$2`,
    [scope.orgId, regressionId],
  )).rows[0]));
}

export function assertRegressionReleaseCandidate(args: {
  candidate: CefCase;
  source: { case_id: string; revision_id: string; family_id: string; content_hash: string };
  regressionId: string;
  observationId: string;
  actorId: string;
}) {
  const { candidate, source, regressionId, observationId, actorId } = args;
  if (candidate.case_id !== source.case_id || candidate.family_id !== source.family_id ||
      candidate.revision_id === source.revision_id || candidate.content_hash === source.content_hash) {
    throw new EvalError("INPUT_INVALID", 422, "The regression must be a new revision of the failed case in the same family.");
  }
  const link = candidate.extensions["caudals.evals/regression"];
  if (!link || typeof link !== "object" || Array.isArray(link) ||
      link.regression_case_id !== regressionId || link.source_observation_id !== observationId ||
      link.source_case_revision_id !== source.revision_id) {
    throw new EvalError("INPUT_INVALID", 422, "The revision must trace to the failed interaction and regression draft.");
  }
  if (candidate.provenance.method !== "human_authored" ||
      candidate.provenance.evidence_level !== "expert_reviewed" ||
      !candidate.provenance.reviewer_ids.includes(actorId)) {
    throw new EvalError("INPUT_INVALID", 422, "A named expert reviewer must revalidate the redacted revision.");
  }
  if (!candidate.reference.source_refs.length) {
    throw new EvalError("INPUT_INVALID", 422, "The revised case needs a verified source reference.");
  }
  if (candidate.reference.graders.some((grader) => ["llm_judge", "human", "json_schema"].includes(grader.kind))) {
    throw new EvalError("INPUT_INVALID", 422, "This release path requires deterministic, locally revalidated graders.");
  }
  const content = [
    candidate.title,
    ...candidate.scenario.messages.map((message) => message.content),
    JSON.stringify(candidate.reference.expected),
    ...candidate.reference.acceptable_alternatives.map((value) => JSON.stringify(value)),
    ...candidate.reference.required_claims,
    ...candidate.reference.prohibited_claims,
    ...candidate.reference.prohibited_actions,
    candidate.reference.derivation_notes ?? "",
  ].join("\n");
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(content) ||
      /\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{20,})\b/i.test(content)) {
    throw new EvalError("INPUT_INVALID", 422, "Remove obvious personal addresses or credentials before releasing the case.");
  }
}

export function releaseRegressionCase(
  scope: EvidenceScope,
  regressionId: string,
  candidateRevisionId: string,
  key: string,
) {
  return withTenant(scope, (db) => idempotent(
    db, scope, `regression-release/${regressionId}`, key, { candidateRevisionId }, async () => {
      const regression = required((await db.query(
        "SELECT * FROM evals.regression_case WHERE org_id=$1 AND id=$2 FOR UPDATE",
        [scope.orgId, regressionId],
      )).rows[0]);
      if (regression.redaction_status === "redacted" && regression.validation_status === "valid") {
        if (regression.draft_case_revision_id !== candidateRevisionId) {
          throw new EvalError("VERSION_CONFLICT", 409, "This regression has already released another revision.");
        }
        return { id: regressionId, candidateRevisionId, redactionStatus: "redacted", validationStatus: "valid" };
      }
      if (regression.redaction_status !== "pending" || regression.validation_status !== "pending") {
        throw new EvalError("VERSION_CONFLICT", 409, "This regression is no longer awaiting review.");
      }
      const row = required((await db.query(
        `SELECT revised.document AS candidate,source.document AS source,
                o.document AS observation,rr.document AS rubric,
                revised.id AS candidate_revision_id
         FROM evals.regression_case rc
         JOIN evals.case_revision source ON (source.org_id,source.id)=(rc.org_id,rc.source_case_revision_id)
         JOIN evals.case_revision revised ON revised.org_id=rc.org_id AND revised.id=$3
         JOIN evals."case" c ON (c.org_id,c.id)=(revised.org_id,revised.case_id)
         JOIN evals.observation o ON (o.org_id,o.id)=(rc.org_id,rc.source_observation_id)
         JOIN evals.rubric_revision rr ON (rr.org_id,rr.id)=(revised.org_id,revised.rubric_revision_id)
         WHERE rc.org_id=$1 AND rc.id=$2 AND c.project_id=rc.project_id
           AND rr.project_id=rc.project_id
           AND NOT EXISTS (
             SELECT 1 FROM evals.suite_case sc
             WHERE sc.org_id=revised.org_id AND sc.case_revision_id=revised.id
           )`,
        [scope.orgId, regressionId, candidateRevisionId],
      )).rows[0]);
      const candidate = caseSchema.parse(row.candidate);
      const source = caseSchema.parse(row.source);
      const observation = observationSchema.parse(row.observation);
      const rubric = rubricSchema.parse(row.rubric);
      assertRegressionReleaseCandidate({
        candidate, source, regressionId,
        observationId: regression.source_observation_id,
        actorId: scope.actorId,
      });
      const check = gradeDeterministically({
        caseRevision: candidate, observation, rubric,
        graderRevisionId: "regression-release-v1",
      });
      if (check.outcome !== "fail" && check.outcome !== "partial") {
        throw new EvalError("INPUT_INVALID", 422, "The failed answer must still fail the revalidated deterministic case.");
      }
      await db.query(
        `UPDATE evals.regression_case SET
           draft_case_revision_id=$3,redaction_status='redacted',validation_status='valid'
         WHERE org_id=$1 AND id=$2`,
        [scope.orgId, regressionId, candidateRevisionId],
      );
      await db.query(
        "INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'regression.released',$3)",
        [scope.orgId, scope.actorId, regressionId],
      );
      return { id: regressionId, candidateRevisionId, redactionStatus: "redacted", validationStatus: "valid", revalidationOutcome: check.outcome };
    },
  ));
}
