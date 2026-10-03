import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { decryptSecret, encryptSecret, type Keyring, type SecretScope } from './envelope';

/** Authorization belongs to the authenticated owner/admin action; client must be tenant scoped. */
export async function addSecretVersion(client: PoolClient, scope: Omit<SecretScope,'versionId'>, actorId:string, value:Buffer, keyVersion:string, keys:Keyring) {
  const record=(await client.query('SELECT * FROM evals.secret_record WHERE org_id=$1 AND id=$2 FOR UPDATE',[scope.orgId,scope.recordId])).rows[0];
  if(!record || record.revoked_at || record.purpose!==scope.purpose || record.scope_id!==scope.scopeId) throw new Error('secret_scope_denied');
  const versionId=randomUUID();
  await client.query('INSERT INTO evals.secret_version(id,org_id,record_id,envelope,created_by) VALUES($1,$2,$3,$4,$5)',[versionId,scope.orgId,scope.recordId,encryptSecret(value,{...scope,versionId},keyVersion,keys),actorId]);
  return versionId;
}
/** Only the inference worker possesses keys. Requires a live, fenced, reserved invocation. */
export async function invocationSecret(client: PoolClient, orgId:string, attemptId:string, versionId:string, fence:string, keys:Keyring):Promise<Buffer> {
  const result=await client.query(`SELECT v.envelope,v.id,r.id AS record_id,r.purpose,r.scope_id FROM evals.secret_version v
    JOIN evals.secret_record r ON (r.org_id,r.id)=(v.org_id,v.record_id)
    JOIN evals.execution_attempt a ON a.org_id=v.org_id AND a.id=$2
    JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id)
    JOIN evals.budget_reservation b ON (b.org_id,b.attempt_id)=(a.org_id,a.id)
    WHERE v.org_id=$1 AND v.id=$3 AND r.revoked_at IS NULL AND r.purpose='provider'
      AND r.scope_id=a.provider_revision_id AND s.input->>'secretVersionId'=v.id::text
      AND a.status='reserved' AND b.state='reserved' AND s.fence=$4 AND a.fence=s.fence AND s.lease_until>now()`,[orgId,attemptId,versionId,fence]);
  const row=result.rows[0]; if(!row) throw new Error('secret_scope_denied');
  return decryptSecret(row.envelope,{orgId,recordId:row.record_id,versionId,purpose:row.purpose,scopeId:row.scope_id},keys);
}
/** Target connector equivalent: the envelope is available only to its live fenced target attempt. */
export async function targetInvocationSecret(client:PoolClient,orgId:string,attemptId:string,versionId:string,fence:string,keys:Keyring):Promise<Buffer>{const result=await client.query(`SELECT v.envelope,v.id,r.id AS record_id,r.purpose,r.scope_id FROM evals.target_attempt a JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id) JOIN evals.target_revision tr ON (tr.org_id,tr.id)=(a.org_id,a.target_revision_id) JOIN evals.target t ON (t.org_id,t.id)=(tr.org_id,tr.target_id) JOIN evals.secret_version v ON v.org_id=a.org_id AND v.id=$3 JOIN evals.secret_record r ON (r.org_id,r.id)=(v.org_id,v.record_id) WHERE a.org_id=$1 AND a.id=$2 AND a.status='dispatching' AND a.fence=$4 AND s.status='running' AND s.fence=$4 AND s.lease_until>now() AND r.revoked_at IS NULL AND r.purpose='target' AND r.scope_id=t.id AND tr.document->'credential'->>'secret_version_id'=v.id::text`,[orgId,attemptId,versionId,fence]);const row=result.rows[0];if(!row)throw new Error('secret_scope_denied');return decryptSecret(row.envelope,{orgId,recordId:row.record_id,versionId,purpose:row.purpose,scopeId:row.scope_id},keys);}

/** Browser-only session material. The session, target revision, attempt lease and
 * target-scoped envelope must all agree; expiry/revocation fail closed. */
export async function browserInvocationSession(
  client: PoolClient,
  orgId: string,
  attemptId: string,
  sessionId: string,
  keys: Keyring,
): Promise<Buffer> {
  const row = (await client.query(`
    SELECT v.envelope,v.id AS version_id,r.id AS record_id,r.purpose,r.scope_id
    FROM evals.target_attempt a
    JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id)
    JOIN evals.target_revision tr ON (tr.org_id,tr.id)=(a.org_id,a.target_revision_id)
    JOIN evals.target t ON (t.org_id,t.id)=(tr.org_id,tr.target_id)
    JOIN evals.browser_login_session bs ON (bs.org_id,bs.target_id)=(t.org_id,t.id)
    JOIN evals.secret_version v ON (v.org_id,v.id)=(bs.org_id,bs.secret_version_id)
    JOIN evals.secret_record r ON (r.org_id,r.id)=(v.org_id,v.record_id)
    WHERE a.org_id=$1 AND a.id=$2 AND bs.id=$3
      AND a.status='dispatching' AND s.status='running'
      AND a.fence=s.fence AND s.lease_until>now()
      AND bs.revoked_at IS NULL AND bs.expires_at>now()
      AND r.revoked_at IS NULL AND r.purpose='target' AND r.scope_id=t.id
      AND tr.document->>'login_session_id'=bs.id::text`, [orgId, attemptId, sessionId])).rows[0];
  if (!row) throw new Error('browser_session_unavailable');
  return decryptSecret(row.envelope, {
    orgId,
    recordId: row.record_id,
    versionId: row.version_id,
    purpose: row.purpose,
    scopeId: row.scope_id,
  }, keys);
}

/** Only the browser executor calls this for an authorized connection probe. */
export async function browserConnectionSession(client: PoolClient, orgId: string, revisionId: string, keys: Keyring): Promise<Buffer | undefined> {
  const revision = (await client.query("SELECT document FROM evals.target_revision WHERE org_id=$1 AND id=$2", [orgId, revisionId])).rows[0];
  if (!revision?.document?.login_session_id) return undefined;
  const row = (await client.query(`SELECT v.envelope,v.id AS version_id,r.id AS record_id,r.scope_id FROM evals.target_revision t
    JOIN evals.browser_login_session s ON s.org_id=t.org_id AND s.target_id=t.target_id AND s.id::text=t.document->>'login_session_id'
    JOIN evals.secret_version v ON (v.org_id,v.id)=(s.org_id,s.secret_version_id)
    JOIN evals.secret_record r ON (r.org_id,r.id)=(v.org_id,v.record_id)
    WHERE t.org_id=$1 AND t.id=$2 AND s.expires_at>now() AND s.revoked_at IS NULL AND r.revoked_at IS NULL AND r.purpose='target' AND r.scope_id=t.target_id`, [orgId, revisionId])).rows[0];
  if (!row) throw new Error("browser_session_unavailable");
  return decryptSecret(row.envelope, { orgId, recordId: row.record_id, versionId: row.version_id, purpose: "target", scopeId: row.scope_id }, keys);
}

/** Nil tenant: provider connection keys belong to the platform, not a workspace. */
export const PLATFORM_SECRET_ORG = '00000000-0000-0000-0000-000000000000';
export function connectionSecretScope(accountId:string):SecretScope {
  return {orgId:PLATFORM_SECRET_ORG,recordId:accountId,versionId:accountId,purpose:'provider',scopeId:accountId};
}
/**
 * The key of a commercial provider connection, for one live reserved attempt
 * on a revision of that account. Same rule as tenant secrets: decrypt only
 * after a reservation exists, and only inside the inference worker.
 */
export async function connectionInvocationSecret(client:PoolClient,orgId:string,attemptId:string,fence:string,keys:Keyring):Promise<Buffer|undefined> {
  // Revisions registered before provider connections (or keyless endpoints) carry no connection key.
  if(!(await client.query("SELECT to_regclass('evals.provider_connection') AS present")).rows[0].present) return undefined;
  const connected=(await client.query(`SELECT 1 FROM evals.execution_attempt a JOIN evals.provider_revision p ON p.id=a.provider_revision_id
    JOIN evals.provider_connection c ON c.account_id=p.account_id AND c.adapter=p.adapter WHERE a.org_id=$1 AND a.id=$2`,[orgId,attemptId])).rowCount;
  if(!connected) return undefined;
  const row=(await client.query(`SELECT c.account_id,c.envelope FROM evals.execution_attempt a
    JOIN evals.workflow_step s ON (s.org_id,s.id)=(a.org_id,a.step_id)
    JOIN evals.budget_reservation b ON (b.org_id,b.attempt_id)=(a.org_id,a.id)
    JOIN evals.provider_revision p ON p.id=a.provider_revision_id
    JOIN evals.provider_connection c ON c.account_id=p.account_id AND c.adapter=p.adapter
    WHERE a.org_id=$1 AND a.id=$2 AND a.status='reserved' AND b.state='reserved' AND s.fence=$3 AND a.fence=s.fence AND s.lease_until>now()`,[orgId,attemptId,fence])).rows[0];
  if(!row) throw new Error('secret_scope_denied');
  if(!row.envelope) return undefined;
  return decryptSecret(row.envelope,connectionSecretScope(row.account_id),keys);
}

/** Web search engine keys (Tavily, Exa) belong to the platform, like provider keys. */
export function webSearchSecretScope(engine:string):SecretScope {
  return {orgId:PLATFORM_SECRET_ORG,recordId:engine,versionId:engine,purpose:'web_search',scopeId:engine};
}
/**
 * Enabled search engines in priority order, keys decrypted. Read only by the
 * inference worker for a call that carries web queries; callers zero the keys.
 */
export async function webSearchSecrets(client:PoolClient,keys:Keyring):Promise<Array<{engine:'tavily'|'exa';key:Buffer}>> {
  if(!(await client.query("SELECT to_regclass('evals.web_search_connection') AS present")).rows[0].present) return [];
  const rows=(await client.query("SELECT engine,envelope FROM evals.web_search_connection WHERE enabled ORDER BY priority,engine")).rows as Array<{engine:'tavily'|'exa';envelope:unknown}>;
  return rows.flatMap(row=>{try{return [{engine:row.engine,key:decryptSecret(row.envelope,webSearchSecretScope(row.engine),keys)}];}catch{return [];}});
}
