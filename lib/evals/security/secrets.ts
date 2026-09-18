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
