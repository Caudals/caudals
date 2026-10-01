import "server-only";
import { randomUUID } from "node:crypto";
import { targetConfigSchema } from "../contracts/connectors";
import { browserProbeEvidenceSchema, capabilityReportForWebsite, probeEvidenceReady, websiteRecipeSchema } from "../contracts/browser";
import { canonicalJson, sha256 } from "../contracts/hashing";
import { EvalError } from "../domain/errors";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";
import { assertWebsiteAuthorization } from "./stage-c";

export function websiteControlTarget(scope: EvidenceScope, targetId: string) {
  return withTenant(scope, async db => {
    const row = (await db.query(`SELECT t.project_id,tr.id,tr.document FROM evals.target t
      JOIN LATERAL (SELECT id,document FROM evals.target_revision WHERE org_id=t.org_id AND target_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1) tr ON true
      WHERE t.org_id=$1 AND t.id=$2 AND t.archived_at IS NULL`, [scope.orgId, targetId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    const config = targetConfigSchema.parse(row.document);
    if (config.kind !== "website") throw new EvalError("INPUT_INVALID", 422, "Choose a website system.");
    const authorization = (await db.query(`SELECT scope,expires_at FROM evals.authorization_record WHERE org_id=$1 AND target_id=$2 AND basis='workspace_member_attestation' ORDER BY created_at DESC,id DESC LIMIT 1`, [scope.orgId, targetId])).rows[0] ?? null;
    assertWebsiteAuthorization(authorization, config.endpoint);
    const recipeRow = config.recipe_revision_id ? (await db.query("SELECT document FROM evals.website_recipe_revision WHERE org_id=$1 AND id=$2 AND target_id=$3", [scope.orgId, config.recipe_revision_id, targetId])).rows[0] : null;
    const draft = (await db.query("SELECT document FROM evals.website_recipe_candidate WHERE org_id=$1 AND target_id=$2 AND source='operator_authored' AND status='needs_operator' AND created_at>COALESCE((SELECT max(created_at) FROM evals.website_recipe_revision r WHERE r.org_id=$1 AND r.target_id=$2),'epoch'::timestamptz) ORDER BY created_at DESC,id DESC LIMIT 1", [scope.orgId, targetId])).rows[0];
    const login = config.login_session_id ? (await db.query("SELECT id FROM evals.browser_login_session WHERE org_id=$1 AND id=$2 AND target_id=$3 AND expires_at>now() AND revoked_at IS NULL", [scope.orgId, config.login_session_id, targetId])).rows[0] : null;
    return { projectId: row.project_id as string, config, recipe: draft?.document ?? recipeRow?.document, loginSessionId: login?.id, sessionExpired: !!config.login_session_id && !login };
  });
}

// Live input arrives many times a second. The attested endpoint changes only
// when the system is edited, so it is reused briefly per workspace target;
// workspace permission is still checked on every request by the route.
const endpoints = new Map<string, { endpoint: string; at: number }>();
export async function websiteControlEndpoint(scope: EvidenceScope, targetId: string) {
  const key = `${scope.orgId}:${targetId}`;
  const cached = endpoints.get(key);
  if (cached && Date.now() - cached.at < 30_000) return cached.endpoint;
  const { config } = await websiteControlTarget(scope, targetId);
  if (endpoints.size > 500) endpoints.clear();
  endpoints.set(key, { endpoint: config.endpoint, at: Date.now() });
  return config.endpoint;
}

// Drafts and validated recipes use the existing tenant/RLS tables and immutable
// target revisions. No second connector abstraction or customer code execution.
export function persistTaughtRecipe(scope: EvidenceScope, targetId: string, raw: unknown, probe?: unknown) {
  const recipe = websiteRecipeSchema.parse(raw);
  const evidence = probe ? browserProbeEvidenceSchema.parse(probe) : null;
  return withTenant(scope, async db => {
    await db.query("SELECT id FROM evals.target WHERE org_id=$1 AND id=$2 FOR UPDATE", [scope.orgId, targetId]);
    const row = (await db.query(`SELECT t.project_id,tr.document FROM evals.target t JOIN LATERAL (SELECT document FROM evals.target_revision WHERE org_id=t.org_id AND target_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1) tr ON true WHERE t.org_id=$1 AND t.id=$2`, [scope.orgId, targetId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    const config = targetConfigSchema.parse(row.document);
    if (config.kind !== "website" || new URL(config.endpoint).origin !== new URL(recipe.start_url).origin) throw new EvalError("INPUT_INVALID", 422);
    if (evidence && !probeEvidenceReady(evidence)) throw new EvalError("CONNECTION_UNSUPPORTED", 409);
    const existing = (await db.query("SELECT id FROM evals.website_recipe_revision WHERE org_id=$1 AND id=$2 AND target_id=$3", [scope.orgId, recipe.recipe_revision_id, targetId])).rows[0];
    if (existing && evidence) {
      // A retried result can refresh the encrypted login and create a new
      // target revision. Attach readiness to that revision as well.
      if (config.recipe_revision_id !== existing.id) throw new EvalError("INPUT_INVALID", 409);
      await db.query(`INSERT INTO evals.connection_check(org_id,target_revision_id,status,capability_report,probe_evidence,completed_at)
        SELECT $1,$2,'ready',$3,$4,now() WHERE NOT EXISTS
        (SELECT 1 FROM evals.connection_check WHERE org_id=$1 AND target_revision_id=$2 AND status='ready')`,
      [scope.orgId, config.target_revision_id, capabilityReportForWebsite(recipe, evidence), evidence]);
      return { status: "ready", recipeRevisionId: existing.id };
    }
    if (!evidence && (await db.query("SELECT id FROM evals.website_recipe_candidate WHERE org_id=$1 AND id=$2", [scope.orgId, recipe.recipe_revision_id])).rowCount) return { status: "needs_operator", recipeRevisionId: recipe.recipe_revision_id };
    const check = (await db.query(`INSERT INTO evals.connection_check(org_id,target_revision_id,status,capability_report,probe_evidence,completed_at)
      VALUES($1,$2,$3,$4,$5,now()) RETURNING id`, [scope.orgId, config.target_revision_id, evidence ? "ready" : "needs_operator", evidence ? capabilityReportForWebsite(recipe, evidence) : null, evidence ?? { kind: "taught_draft" }])).rows[0];
    if (evidence) {
      await db.query(`INSERT INTO evals.website_recipe_revision(id,org_id,project_id,target_id,content_hash,document,probe_evidence) VALUES($1,$2,$3,$4,$5,$6,$7)`, [recipe.recipe_revision_id, scope.orgId, row.project_id, targetId, recipe.content_hash, recipe, evidence]);
      const next = targetConfigSchema.parse({ ...config, target_revision_id: randomUUID(), recipe_revision_id: recipe.recipe_revision_id });
      await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)", [next.target_revision_id, scope.orgId, targetId, sha256(canonicalJson(next)), next]);
      // The check belongs to the frozen revision used by the eval pipeline.
      await db.query(`INSERT INTO evals.connection_check(org_id,target_revision_id,status,capability_report,probe_evidence,completed_at) VALUES($1,$2,'ready',$3,$4,now())`, [scope.orgId, next.target_revision_id, capabilityReportForWebsite(recipe, evidence), evidence]);
      await db.query("UPDATE evals.website_recipe_candidate SET status='validated',reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2", [scope.orgId, recipe.recipe_revision_id]);
    } else {
      await db.query(`INSERT INTO evals.website_recipe_candidate(id,org_id,project_id,target_id,target_revision_id,connection_check_id,source,status,document,reason_code) VALUES($1,$2,$3,$4,$5,$6,'operator_authored','needs_operator',$7,'test_connection_required')`, [recipe.recipe_revision_id, scope.orgId, row.project_id, targetId, config.target_revision_id, check.id, recipe]);
    }
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)", [scope.orgId, scope.actorId, evidence ? "website.teach.validated" : "website.teach.saved", targetId]);
    return { status: evidence ? "ready" : "needs_operator", recipeRevisionId: recipe.recipe_revision_id };
  });
}
