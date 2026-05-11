"use server";

import { requireCurrentOperator } from "@/lib/auth/operator-session";
import { queryRows } from "@/lib/db/client";
import {
  actionError,
  type ActionError,
} from "@/lib/validators/action-envelope";

export type OperatorSecurityRosterEntry = {
  id: string;
  email: string;
  name: string;
  role: string;
  state: string;
  mfaRequired: boolean;
  mfaEnabled: boolean;
  webauthnRequired: boolean;
  passkeyCount: number;
  securityComplete: boolean;
  lastSessionAt: string | null;
  lastSessionExpiresAt: string | null;
};

export type OperatorSecurityRoster = {
  operators: OperatorSecurityRosterEntry[];
  summary: {
    total: number;
    complete: number;
    actionNeeded: number;
    mfaRequired: number;
    mfaEnabled: number;
    webauthnRequired: number;
    passkeyUsers: number;
  };
};

export type OperatorSecurityRosterResult =
  | { ok: true; roster: OperatorSecurityRoster }
  | ActionError;

type OperatorSecurityRosterRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  state: string;
  mfaRequired: boolean | null;
  mfaEnabled: boolean | null;
  webauthnRequired: boolean | null;
  passkeyCount: number | string | null;
  lastSessionAt: string | Date | null;
  lastSessionExpiresAt: string | Date | null;
};

function normalizeDate(value: string | Date | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function mapSecurityRow(row: OperatorSecurityRosterRow): OperatorSecurityRosterEntry {
  const mfaRequired = row.mfaRequired === true;
  const mfaEnabled = row.mfaEnabled === true;
  const webauthnRequired = row.webauthnRequired === true;
  const passkeyCount = Number(row.passkeyCount ?? 0);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    state: row.state,
    mfaRequired,
    mfaEnabled,
    webauthnRequired,
    passkeyCount,
    securityComplete:
      (!mfaRequired || mfaEnabled) &&
      (!webauthnRequired || passkeyCount > 0),
    lastSessionAt: normalizeDate(row.lastSessionAt),
    lastSessionExpiresAt: normalizeDate(row.lastSessionExpiresAt),
  };
}

export async function getOperatorSecurityRoster(): Promise<OperatorSecurityRosterResult> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  if (session.operator.role !== "admin") {
    return actionError(
      "FORBIDDEN",
      "Only admin operators can inspect operator security enrollment"
    );
  }

  const rows = await queryRows<OperatorSecurityRosterRow>(
    `
      SELECT
        o.id,
        o.email::text,
        o.name,
        o.role,
        o.state,
        o.mfa_required AS "mfaRequired",
        COALESCE(u."twoFactorEnabled", false) AS "mfaEnabled",
        o.webauthn_required AS "webauthnRequired",
        COALESCE((
          SELECT count(*)::int
          FROM auth_passkey p
          WHERE p."userId" = u.id
        ), 0) AS "passkeyCount",
        (
          SELECT max(s."createdAt")
          FROM auth_session s
          WHERE s."userId" = u.id
        ) AS "lastSessionAt",
        (
          SELECT max(s."expiresAt")
          FROM auth_session s
          WHERE s."userId" = u.id
        ) AS "lastSessionExpiresAt"
      FROM "operator" o
      LEFT JOIN auth_user u ON u.email = o.email::text
      WHERE o.org_id = $1
        AND o.deleted_at IS NULL
      ORDER BY
        CASE WHEN o.role = 'admin' THEN 0 ELSE 1 END,
        o.email::text
    `,
    [orgId],
    {
      orgId,
      operatorId: session.operator.id,
      serviceRole: true,
    }
  );

  const operators = rows.map(mapSecurityRow);
  const summary = {
    total: operators.length,
    complete: operators.filter((operator) => operator.securityComplete).length,
    actionNeeded: operators.filter((operator) => !operator.securityComplete)
      .length,
    mfaRequired: operators.filter((operator) => operator.mfaRequired).length,
    mfaEnabled: operators.filter((operator) => operator.mfaEnabled).length,
    webauthnRequired: operators.filter((operator) => operator.webauthnRequired)
      .length,
    passkeyUsers: operators.filter((operator) => operator.passkeyCount > 0)
      .length,
  };

  return {
    ok: true,
    roster: {
      operators,
      summary,
    },
  };
}
