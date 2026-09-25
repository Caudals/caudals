import "server-only";
import { randomUUID } from "node:crypto";
import { encryptSecret, loadKeyring, type Keyring } from "../security/envelope";
import { canonicalJson, sha256 } from "../contracts/hashing";
import { targetConfigSchema } from "../contracts/connectors";
import { EvalError } from "../domain/errors";
import { withTenant } from "./db";
import type { EvidenceScope } from "./evidence";

// Write-only target credentials (spec §5.5, §8.2, §16.2). The web process
// encrypts with the envelope keyring and stores through SECURITY DEFINER
// functions; its database role has no SELECT on envelopes, so nothing here can
// read a secret back. Decryption happens only in the fenced worker invocation.

let cachedKeyring: Keyring | null = null;
function keyring(): Keyring {
  if (cachedKeyring) return cachedKeyring;
  const file = process.env.EVALS_MASTER_KEYRING_FILE;
  if (!file) throw new EvalError("PROVIDER_UNAVAILABLE", 503, "Credential storage is not configured");
  cachedKeyring = loadKeyring(file);
  return cachedKeyring;
}
function currentKeyVersion(keys: Keyring): string {
  const configured = process.env.EVALS_MASTER_KEY_VERSION;
  if (configured && keys.has(configured)) return configured;
  return [...keys.keys()].sort().at(-1)!;
}

export interface CredentialInput {
  recordId?: string;
  label: string;
  kind: "bearer" | "header_token";
  headerName: string;
  value: string;
  expiresAt?: string | null;
}

/**
 * Stores a new credential version for a target and binds it in a new immutable
 * target revision, so existing frozen runs keep the revision they used.
 */
export async function storeTargetCredential(scope: EvidenceScope, targetId: string, input: CredentialInput) {
  const keys = keyring();
  const keyVersion = currentKeyVersion(keys);
  const recordId = input.recordId ?? randomUUID();
  const versionId = randomUUID();
  const value = Buffer.from(input.value, "utf8");
  let envelope;
  try {
    envelope = encryptSecret(value, { orgId: scope.orgId, recordId, versionId, purpose: "target", scopeId: targetId }, keyVersion, keys);
  } finally {
    value.fill(0);
  }
  return withTenant(scope, async (db) => {
    const latest = (await db.query(
      `SELECT r.document FROM evals.target_revision r JOIN evals.target t ON (t.org_id,t.id)=(r.org_id,r.target_id)
       WHERE r.org_id=$1 AND r.target_id=$2 ORDER BY r.created_at DESC, r.id DESC LIMIT 1`,
      [scope.orgId, targetId],
    )).rows[0];
    if (!latest) throw new EvalError("SCOPE_DENIED", 404);
    const previous = targetConfigSchema.parse(latest.document);
    if (!("credential" in previous)) {
      throw new EvalError("CONNECTION_UNSUPPORTED", 422, "This connection type does not use a stored API credential");
    }
    try {
      await db.query("SELECT evals.write_target_credential($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        scope.orgId, targetId, recordId, versionId, envelope, input.label, input.kind, input.headerName, input.expiresAt ?? null,
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === "42501") throw new EvalError("SCOPE_DENIED", 404);
      throw error;
    }
    const config = targetConfigSchema.parse({
      ...previous,
      target_revision_id: randomUUID(),
      credential: { kind: input.kind, secret_version_id: versionId, header_name: input.headerName },
    });
    const revision = (await db.query(
      "INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document) VALUES($1,$2,$3,$4,$5) RETURNING id,content_hash",
      [config.target_revision_id, scope.orgId, targetId, sha256(canonicalJson(config)), config],
    )).rows[0];
    return { recordId, versionId, targetRevisionId: revision.id, contentHash: revision.content_hash };
  });
}

/** Label, kind, expiry, rotation history and last connection check. Never values. */
export function listTargetCredentials(scope: EvidenceScope, targetId: string) {
  return withTenant(scope, async (db) => {
    const target = (await db.query("SELECT id FROM evals.target WHERE org_id=$1 AND id=$2", [scope.orgId, targetId])).rows[0];
    if (!target) throw new EvalError("SCOPE_DENIED", 404);
    const records = (await db.query(
      `SELECT r.id,r.label,r.credential_kind,r.header_name,r.expires_at,r.revoked_at,r.created_by,r.created_at,
        (SELECT json_agg(json_build_object('id',v.id,'created_at',v.created_at,'created_by',v.created_by) ORDER BY v.created_at DESC)
         FROM evals.secret_version v WHERE v.org_id=r.org_id AND v.record_id=r.id) AS versions
       FROM evals.secret_record r WHERE r.org_id=$1 AND r.purpose='target' AND r.scope_id=$2 ORDER BY r.created_at DESC`,
      [scope.orgId, targetId],
    )).rows;
    const lastCheck = (await db.query(
      `SELECT c.created_at,c.status FROM evals.connection_check c JOIN evals.target_revision r ON (r.org_id,r.id)=(c.org_id,c.target_revision_id)
       WHERE c.org_id=$1 AND r.target_id=$2 ORDER BY c.created_at DESC LIMIT 1`,
      [scope.orgId, targetId],
    )).rows[0] ?? null;
    return { targetId, lastCheck, credentials: records.map((r) => ({ ...r, versions: r.versions ?? [] })) };
  });
}

export function revokeTargetCredential(scope: EvidenceScope, recordId: string) {
  return withTenant(scope, async (db) => {
    try {
      const revoked = (await db.query("SELECT evals.revoke_target_credential($1,$2) AS revoked", [scope.orgId, recordId])).rows[0].revoked;
      if (!revoked) throw new EvalError("SCOPE_DENIED", 404);
      return { recordId, revoked: true };
    } catch (error) {
      if ((error as { code?: string }).code === "42501") throw new EvalError("SCOPE_DENIED", 404);
      throw error;
    }
  });
}
