import "server-only";

import type { PoolClient } from "pg";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import type { Locale } from "@/lib/i18n/config";
import { recordTermsAcceptance } from "./acceptance";
import { legalDocumentVersion } from "./versions";

/**
 * DPA click-through acceptance (launch L-30, spec P-42).
 *
 * An owner accepts the published Data Processing Agreement for their workspace
 * in Settings. The acceptance is one row in `evals.terms_acceptance` written by
 * `evals.record_terms_acceptance` (migration 081, launch L-01) with document
 * `dpa` and context `dpa`: the version, the date and the signer (the acting
 * person). An audit event (`legal.dpa_accepted`) keeps the signer's name and
 * email as they were at the time, because the acceptance row holds only the
 * account id. Every member can see the status; only owners can accept, and a
 * Caudals operator never accepts on a customer's behalf.
 */

export const DPA_AUDIT_ACTION = "legal.dpa_accepted";

export type DpaStatus = {
  document: "dpa";
  /** The version published at `/legal/dpa` (lib/legal/versions.ts). */
  currentVersion: string;
  /** Whether the person asking is an owner of the workspace. */
  canAccept: boolean;
  /** The person asking, as an acceptance would record them. */
  you: { name: string; email: string };
  /** The workspace's acceptance of the current version, or else its latest one. */
  acceptance: {
    id: string;
    version: string;
    acceptedAt: string;
    locale: Locale | null;
    current: boolean;
    /** Name and email at signing; shown to owners, operators and the signer. */
    signer: { name: string; email: string } | null;
  } | null;
};

type AcceptanceRow = { id: string; user_id: string; version: string; locale: Locale | null; accepted_at: Date | string };

async function readStatus(db: PoolClient, identity: EvalIdentity, orgId: string): Promise<DpaStatus> {
  const currentVersion = legalDocumentVersion("dpa");
  const membership = await db.query<{ role: string }>(
    "SELECT role FROM evals.membership WHERE org_id=$1 AND user_id=$2",
    [orgId, identity.user.id],
  );
  const { rows } = await db.query<AcceptanceRow>(
    `SELECT id, user_id, version, locale, accepted_at FROM evals.terms_acceptance
      WHERE org_id=$1 AND document='dpa' AND context='dpa'
      ORDER BY (version=$2) DESC, accepted_at DESC, id DESC LIMIT 1`,
    [orgId, currentVersion],
  );
  const row = rows[0];
  let signer: { name: string; email: string } | null = null;
  if (row) {
    // Readable by owners, operators and platform administrators (audit_scope).
    const audit = await db.query<{ details: { signer?: { name?: unknown; email?: unknown } } | null }>(
      "SELECT details FROM evals.audit_event WHERE org_id=$1 AND action=$2 AND subject_id=$3 ORDER BY created_at LIMIT 1",
      [orgId, DPA_AUDIT_ACTION, row.id],
    );
    const recorded = audit.rows[0]?.details?.signer;
    if (recorded && typeof recorded.name === "string" && typeof recorded.email === "string") {
      signer = { name: recorded.name, email: recorded.email };
    } else if (row.user_id === identity.user.id) {
      signer = { name: identity.user.name, email: identity.user.email };
    }
  }
  return {
    document: "dpa",
    currentVersion,
    canAccept: membership.rows[0]?.role === "owner",
    you: { name: identity.user.name, email: identity.user.email },
    acceptance: row
      ? {
          id: row.id,
          version: row.version,
          acceptedAt: new Date(row.accepted_at).toISOString(),
          locale: row.locale,
          current: row.version === currentVersion,
          signer,
        }
      : null,
  };
}

/** The workspace's DPA status for any member (or a platform administrator). */
export function getDpaStatus(identity: EvalIdentity, orgId: string): Promise<DpaStatus> {
  return withTenant({ orgId, actorId: identity.user.id }, (db) => readStatus(db, identity, orgId));
}

/**
 * Records an owner's acceptance of the current DPA version. Idempotent per
 * request id (the function returns the first row on a retry), and a workspace
 * that has already accepted the current version gets its status back without
 * a second record.
 */
export function acceptDpa(
  identity: EvalIdentity,
  orgId: string,
  input: { version: string; locale: Locale | null; requestId: string },
): Promise<DpaStatus> {
  return withTenant({ orgId, actorId: identity.user.id }, async (db) => {
    const membership = await db.query<{ role: string }>(
      "SELECT role FROM evals.membership WHERE org_id=$1 AND user_id=$2",
      [orgId, identity.user.id],
    );
    if (membership.rows[0]?.role !== "owner") {
      throw new EvalError("OWNER_REQUIRED", 403, "Only a workspace owner can accept the DPA.");
    }
    const currentVersion = legalDocumentVersion("dpa");
    if (input.version !== currentVersion) {
      throw new EvalError("VERSION_CHANGED", 409, "The DPA has been updated. Review the current version and accept it again.");
    }
    // A retry, or a second owner, finds the current version already accepted.
    const existing = await readStatus(db, identity, orgId);
    if (existing.acceptance?.current) return existing;
    const [id] = await recordTermsAcceptance(db, {
      orgId,
      documents: [{ document: "dpa", version: currentVersion }],
      context: "dpa",
      locale: input.locale,
      requestId: input.requestId,
    });
    if (!id) throw new EvalError("SERVICE_UNAVAILABLE", 503, "The acceptance could not be recorded.");
    await db.query(
      `INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id, details)
       SELECT $1, $2, $3, $4, $5
        WHERE NOT EXISTS (SELECT 1 FROM evals.audit_event WHERE org_id=$1 AND action=$3 AND subject_id=$4)`,
      [orgId, identity.user.id, DPA_AUDIT_ACTION, id, {
        document: "dpa",
        version: currentVersion,
        locale: input.locale,
        request_id: input.requestId,
        signer: { name: identity.user.name, email: identity.user.email },
      }],
    );
    return readStatus(db, identity, orgId);
  });
}
