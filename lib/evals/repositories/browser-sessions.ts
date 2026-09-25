import "server-only";
import { randomUUID } from "node:crypto";
import { canonicalJson, sha256 } from "../contracts/hashing";
import { scopedBrowserStorageState } from "../contracts/browser";
import { targetConfigSchema } from "../contracts/connectors";
import { EvalError } from "../domain/errors";
import { encryptSecret, loadKeyring, type Keyring } from "../security/envelope";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

// Operator-assisted website login (spec §8.3): an owner or operator signs in
// to the site in their own isolated browser, exports its storage state, and
// uploads it here. The state is validated to the attested site, encrypted with
// the browser-session keyring (the only keys the browser executor holds),
// limited to seven days, and bound to a new system revision. Passwords never
// enter Caudals and CAPTCHAs are never bypassed.

const MAX_HOURS = 168;
let cachedKeys: Keyring | null = null;
function browserKeys(): Keyring {
  if (cachedKeys) return cachedKeys;
  const file = process.env.EVALS_BROWSER_SESSION_KEYRING_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Website login sessions are not configured.");
  cachedKeys = loadKeyring(file);
  return cachedKeys;
}

export async function storeLoginSession(scope: EvidenceScope, targetId: string, input: { storageState: unknown; expiresInHours: number }) {
  if (!Number.isInteger(input.expiresInHours) || input.expiresInHours < 1 || input.expiresInHours > MAX_HOURS) {
    throw new EvalError("INPUT_INVALID", 422, "Login sessions expire within seven days.");
  }
  const keys = browserKeys();
  const keyVersion = [...keys.keys()].sort().at(-1)!;
  return withTenant(scope, async (db) => {
    const latest = (await db.query(`SELECT document FROM evals.target_revision WHERE org_id=$1 AND target_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`, [scope.orgId, targetId])).rows[0];
    if (!latest) throw new EvalError("SCOPE_DENIED", 404);
    const config = targetConfigSchema.parse(latest.document);
    if (config.kind !== "website") throw new EvalError("CONNECTION_UNSUPPORTED", 422, "Login sessions apply only to website systems.");
    let state;
    try { state = scopedBrowserStorageState(input.storageState, config.endpoint); }
    catch { throw new EvalError("INPUT_INVALID", 422, "The session must be a Playwright storage state whose cookies and storage belong only to the attested website."); }
    const recordId = randomUUID(), versionId = randomUUID(), sessionId = randomUUID();
    const value = Buffer.from(JSON.stringify(state), "utf8");
    let envelope;
    try { envelope = encryptSecret(value, { orgId: scope.orgId, recordId, versionId, purpose: "target", scopeId: targetId }, keyVersion, keys); }
    finally { value.fill(0); }
    try {
      await db.query("SELECT evals.write_target_credential($1,$2,$3,$4,$5,$6,NULL,NULL,now()+make_interval(hours=>$7))",
        [scope.orgId, targetId, recordId, versionId, envelope, "Website login session", input.expiresInHours]);
    } catch (error) {
      if ((error as { code?: string }).code === "42501") throw new EvalError("SCOPE_DENIED", 404);
      throw error;
    }
    const session = (await db.query(`INSERT INTO evals.browser_login_session(id,org_id,target_id,secret_version_id,expires_at)
      VALUES($1,$2,$3,$4,now()+make_interval(hours=>$5)) RETURNING id,expires_at`, [sessionId, scope.orgId, targetId, versionId, input.expiresInHours])).rows[0];
    const next = targetConfigSchema.parse({ ...config, target_revision_id: randomUUID(), login_session_id: sessionId });
    await db.query("INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5)",
      [next.target_revision_id, scope.orgId, targetId, sha256(canonicalJson(next)), next]);
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'website.login_session.stored',$3)", [scope.orgId, scope.actorId, sessionId]);
    return { sessionId, expiresAt: session.expires_at, targetRevisionId: next.target_revision_id };
  });
}

export function listLoginSessions(scope: EvidenceScope, targetId: string) {
  return withTenant(scope, async (db) => {
    if (!(await db.query("SELECT 1 FROM evals.target WHERE org_id=$1 AND id=$2", [scope.orgId, targetId])).rowCount) throw new EvalError("SCOPE_DENIED", 404);
    const sessions = (await db.query(`SELECT id,created_at,expires_at,revoked_at,last_validated_at,
        CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN expires_at<=now() THEN 'expired' ELSE 'active' END AS state
      FROM evals.browser_login_session WHERE org_id=$1 AND target_id=$2 ORDER BY created_at DESC LIMIT 20`, [scope.orgId, targetId])).rows;
    const captures = (await db.query(`SELECT c.id,c.reason_code,c.created_at,c.expires_at,c.redaction FROM evals.browser_capture c
      JOIN evals.target_revision r ON (r.org_id,r.id)=(c.org_id,c.target_revision_id)
      WHERE c.org_id=$1 AND r.target_id=$2 AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 5`, [scope.orgId, targetId])).rows;
    return { sessions, captures };
  });
}

export function revokeLoginSession(scope: EvidenceScope, targetId: string, sessionId: string) {
  return withTenant(scope, async (db) => {
    const row = (await db.query(`UPDATE evals.browser_login_session SET revoked_at=COALESCE(revoked_at,now())
      WHERE org_id=$1 AND target_id=$2 AND id=$3 RETURNING secret_version_id`, [scope.orgId, targetId, sessionId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    const record = (await db.query("SELECT record_id FROM evals.secret_version WHERE org_id=$1 AND id=$2", [scope.orgId, row.secret_version_id])).rows[0];
    if (record) await db.query("SELECT evals.revoke_target_credential($1,$2)", [scope.orgId, record.record_id]);
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,'website.login_session.revoked',$3)", [scope.orgId, scope.actorId, sessionId]);
    return { sessionId, revoked: true };
  });
}

export function getBrowserCapture(scope: EvidenceScope, captureId: string) {
  return withTenant(scope, async (db) => {
    const row = (await db.query("SELECT bytes,media_type FROM evals.browser_capture WHERE org_id=$1 AND id=$2 AND expires_at>now()", [scope.orgId, captureId])).rows[0];
    if (!row) throw new EvalError("SCOPE_DENIED", 404);
    return row as { bytes: Buffer; media_type: string };
  });
}
