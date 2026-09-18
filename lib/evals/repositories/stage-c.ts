import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { EvalError } from "../domain/errors";
import { canonicalJson, sha256, withContentHash } from "../contracts/hashing";
import { targetConfigSchema, type TargetConfig } from "../contracts/connectors";
import { caseSchema } from "../contracts/cases";
import { candidateInputSchema } from "../contracts/projections";
import { toolFixtureSchema, type scenarioSchema } from "../contracts/scenarios";
import { websiteRecipeSchema } from "../contracts/browser";
import {
  browserDiscoverySchema,
  controlWorkflow,
  digest,
  enqueueBrowserDiscovery,
  enqueueTargetExecution,
} from "../queue/store";
import { idempotent, type EvidenceScope } from "./evidence";
import { withTenant } from "./db";

function required<T>(value: T | undefined): T {
  if (!value) throw new EvalError("SCOPE_DENIED", 404);
  return value;
}

function connectionType(config: TargetConfig) {
  return config.kind;
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
        "SELECT * FROM evals.workspace_entitlement WHERE org_id=$1 FOR SHARE",
        [orgId],
      )
    ).rows[0],
  );
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
        `SELECT e.*,p.title AS project_title,
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
        `SELECT t.id,t.title,tr.id AS target_revision_id,tr.document,
          cc.status AS connection_status,cc.error_code,cc.capability_report
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
      const limits = await entitlement(db, scope.orgId);
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
      const target = required(
        (
          await db.query(
            `SELECT tr.*,t.project_id
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
              input.suiteVersionId ?? evaluation.selected_suite_version_id ?? null,
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
      const capability = (
        await db.query(
          `SELECT capability_report FROM evals.connection_check
           WHERE org_id=$1 AND target_revision_id=$2 AND status='ready'
           ORDER BY completed_at DESC,id DESC LIMIT 1`,
          [scope.orgId, target.id],
        )
      ).rows[0]?.capability_report;
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
    const workflow = required(
      (
        await db.query(
          "SELECT id FROM evals.execution_workflow WHERE org_id=$1 AND run_id=$2",
          [scope.orgId, runId],
        )
      ).rows[0],
    );
    await controlWorkflow(db, scope.orgId, workflow.id, action);
    return { runId, action };
  });
}

export function forkSuite(
  scope: EvidenceScope,
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
               WHERE sv.org_id=$1 AND sv.id=$2`,
              [scope.orgId, suiteVersionId],
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

export function createRegressionDraft(
  scope: EvidenceScope,
  observationId: string,
) {
  return withTenant(scope, async (db) => {
    const source = required(
      (
        await db.query(
          `SELECT o.id,cu.case_revision_id,e.project_id
           FROM evals.observation o
           JOIN evals.case_unit cu ON (cu.org_id,cu.id)=(o.org_id,o.case_unit_id)
           JOIN evals.run r ON (r.org_id,r.id)=(o.org_id,o.run_id)
           JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
           WHERE o.org_id=$1 AND o.id=$2`,
          [scope.orgId, observationId],
        )
      ).rows[0],
    );
    return (
      await db.query(
        `INSERT INTO evals.regression_case(
           org_id,project_id,source_observation_id,source_case_revision_id
         ) VALUES($1,$2,$3,$4)
         ON CONFLICT(org_id,source_observation_id) DO UPDATE
           SET source_observation_id=EXCLUDED.source_observation_id
         RETURNING id,redaction_status,validation_status`,
        [scope.orgId, source.project_id, source.id, source.case_revision_id],
      )
    ).rows[0];
  });
}
