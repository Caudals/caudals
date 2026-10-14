import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { sha256 } from "@/lib/evals/contracts/hashing";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { deletePrivateObject, objectKey, readVerified, sealObject } from "@/lib/evals/storage/private";

/**
 * Countersigned DPA copies (launch L-32, the L-30 follow-up of spec P-42).
 * For managed customers who sign the DPA on paper, Caudals operations attach
 * the countersigned PDF to the workspace's DPA acceptance record. The file is
 * sealed in private storage and recorded by evals.attach_dpa_countersigned
 * (migration 108), which requires a platform operator or administrator and
 * writes the audit event. Row-level security lets only the workspace's owners
 * and Caudals operations see (and so download) it; removal keeps the record
 * and deletes the stored file.
 */

export const DPA_COUNTERSIGNED_MAX_BYTES = 10 * 1024 * 1024;

export type DpaCountersigned = {
  id: string;
  acceptanceId: string;
  version: string;
  fileName: string;
  byteSize: number;
  uploadedAt: string;
};

type Row = { id: string; acceptance_id: string; version: string; file_name: string; byte_size: number; uploaded_at: Date | string; object_key: string; sha256: string };

/** Platform operators and administrators; customers never attach or remove. */
export function canAttachCountersigned(identity: Pick<EvalIdentity, "platformRole">) {
  return identity.platformRole === "platform_admin" || identity.platformRole === "operator";
}

/** The workspace's latest live copy, as row-level security lets the caller see it (owners and operations). */
export async function readCountersigned(db: PoolClient, orgId: string): Promise<DpaCountersigned | null> {
  const row = (await db.query<Row>(
    "SELECT id,acceptance_id,version,file_name,byte_size,uploaded_at,object_key,sha256 FROM evals.dpa_countersigned WHERE org_id=$1 AND removed_at IS NULL ORDER BY uploaded_at DESC,id DESC LIMIT 1",
    [orgId],
  )).rows[0];
  return row
    ? { id: row.id, acceptanceId: row.acceptance_id, version: row.version, fileName: row.file_name, byteSize: Number(row.byte_size), uploadedAt: new Date(row.uploaded_at).toISOString() }
    : null;
}

/** A display name without path, control characters or quotes. */
export function countersignedFileName(raw: string | null | undefined) {
  const base = (raw ?? "").split(/[\\/]/).at(-1) ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f"<>]/g, "").trim().slice(0, 200);
  return clean || "countersigned-dpa.pdf";
}

function databaseCode(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export async function attachCountersigned(
  identity: EvalIdentity,
  orgId: string,
  input: { acceptanceId: string; fileName: string; bytes: Buffer },
): Promise<DpaCountersigned> {
  if (!canAttachCountersigned(identity)) throw new EvalError("OPERATOR_REQUIRED", 403, "Only Caudals operations can attach a countersigned copy.");
  if (input.bytes.length < 5 || input.bytes.length > DPA_COUNTERSIGNED_MAX_BYTES) throw new EvalError("INPUT_INVALID", 413, "Attach a PDF of up to 10 MB.");
  if (input.bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new EvalError("INPUT_INVALID", 415, "The file is not a PDF.");
  const key = objectKey(orgId, randomUUID(), true);
  const hash = sha256(input.bytes);
  await sealObject(key, input.bytes, "application/pdf");
  try {
    return await withTenant({ orgId, actorId: identity.user.id }, async (db) => {
      await db.query("SELECT evals.attach_dpa_countersigned($1,$2,$3,$4,$5,$6) AS id", [orgId, input.acceptanceId, key, hash, input.bytes.length, countersignedFileName(input.fileName)]);
      const attached = await readCountersigned(db, orgId);
      if (!attached) throw new EvalError("SERVICE_UNAVAILABLE", 503, "The copy could not be recorded.");
      return attached;
    });
  } catch (error) {
    await deletePrivateObject(key).catch(() => undefined);
    const code = databaseCode(error);
    if (code === "ACCEPTANCE_NOT_FOUND") throw new EvalError("NOT_FOUND", 404, "That DPA acceptance does not belong to this workspace.");
    if (code === "ALREADY_ATTACHED") throw new EvalError("VERSION_CONFLICT", 409, "A countersigned copy is already attached. Remove it first.");
    if (code === "OPERATOR_REQUIRED") throw new EvalError("OPERATOR_REQUIRED", 403, "Only Caudals operations can attach a countersigned copy.");
    throw error;
  }
}

/** The stored PDF for an owner or operations; every download is audited. */
export async function openCountersigned(identity: EvalIdentity, orgId: string, id: string) {
  const row = await withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    const found = (await db.query<Row>(
      "SELECT id,acceptance_id,version,file_name,byte_size,uploaded_at,object_key,sha256 FROM evals.dpa_countersigned WHERE org_id=$1 AND id=$2 AND removed_at IS NULL",
      [orgId, id],
    )).rows[0];
    if (!found) throw new EvalError("SCOPE_DENIED", 404);
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'legal.dpa_countersigned_downloaded',$3,$4)", [
      orgId, identity.user.id, id, { acceptance_id: found.acceptance_id, version: found.version },
    ]);
    return found;
  });
  const bytes = await readVerified(row.object_key, Number(row.byte_size), row.sha256);
  return { bytes, version: row.version };
}

/** Operations remove a copy (the stored file first, then the record, with the reason in the audit log). */
export async function removeCountersigned(identity: EvalIdentity, orgId: string, id: string, reason: string) {
  if (!canAttachCountersigned(identity)) throw new EvalError("OPERATOR_REQUIRED", 403, "Only Caudals operations can remove a countersigned copy.");
  const scope = { orgId, actorId: identity.user.id };
  const row = await withTenant(scope, async (db) => (await db.query<Row>(
    "SELECT id,object_key FROM evals.dpa_countersigned WHERE org_id=$1 AND id=$2 AND removed_at IS NULL", [orgId, id])).rows[0]);
  if (!row) throw new EvalError("SCOPE_DENIED", 404);
  await deletePrivateObject(row.object_key);
  try {
    await withTenant(scope, (db) => db.query("SELECT evals.remove_dpa_countersigned($1,$2,$3)", [orgId, id, reason]));
  } catch (error) {
    if (databaseCode(error) === "OPERATOR_REQUIRED") throw new EvalError("OPERATOR_REQUIRED", 403, "Only Caudals operations can remove a countersigned copy.");
    throw error;
  }
  return { id, removed: true };
}
