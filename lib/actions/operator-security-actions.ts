"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentOperator } from "@/lib/auth/operator-session";
import { queryRows } from "@/lib/db/client";
import { createPrefixedId } from "@/lib/operator/ids";
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

export type OperatorSecurityResetLinksState = {
  ok: boolean;
  message: string;
  resetRequests: number;
  failedRequests: number;
};

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
  const mfaRequired = false;
  const mfaEnabled = row.mfaEnabled === true;
  const webauthnRequired = false;
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

function isFixtureOperatorEmail(email: string) {
  return email.toLowerCase().endsWith("@caudals.local");
}

function isResetEligible(operator: OperatorSecurityRosterEntry) {
  return (
    !operator.securityComplete &&
    (operator.mfaRequired || operator.webauthnRequired) &&
    !isFixtureOperatorEmail(operator.email)
  );
}

function getBaseUrl() {
  const baseUrl =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    throw new Error(
      "BETTER_AUTH_URL, NEXT_PUBLIC_BETTER_AUTH_URL, or NEXT_PUBLIC_APP_URL is required when sending reset emails"
    );
  }

  return baseUrl;
}

async function requireAdminOperatorSession() {
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

  return { session, orgId } as const;
}

async function fetchSecurityRows(
  orgId: string,
  operatorId: string
) {
  return queryRows<OperatorSecurityRosterRow>(
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
      operatorId,
      serviceRole: true,
    }
  );
}

function buildRoster(rows: OperatorSecurityRosterRow[]): OperatorSecurityRoster {
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
    operators,
    summary,
  };
}

export async function getOperatorSecurityRoster(): Promise<OperatorSecurityRosterResult> {
  const admin = await requireAdminOperatorSession();

  if ("error" in admin) {
    return admin;
  }

  const { session, orgId } = admin;
  const rows = await fetchSecurityRows(orgId, session.operator.id);

  return {
    ok: true,
    roster: buildRoster(rows),
  };
}

export async function requestOperatorSecurityResetLinks(
  _previousState?: OperatorSecurityResetLinksState
): Promise<OperatorSecurityResetLinksState> {
  const admin = await requireAdminOperatorSession();

  if ("error" in admin) {
    return {
      ok: false,
      message: admin.error,
      resetRequests: 0,
      failedRequests: 0,
    };
  }

  const { session, orgId } = admin;
  const rows = await fetchSecurityRows(orgId, session.operator.id);
  const roster = buildRoster(rows);
  const eligibleOperators = roster.operators.filter(isResetEligible);

  if (eligibleOperators.length === 0) {
    return {
      ok: true,
      message: "No reset-eligible operators need security enrollment.",
      resetRequests: 0,
      failedRequests: 0,
    };
  }

  const baseUrl = getBaseUrl();
  const url = new URL("/api/auth/request-password-reset", baseUrl);
  const redirectTo = new URL("/auth/reset-password", baseUrl).toString();
  let resetRequests = 0;
  let failedRequests = 0;

  for (const operator of eligibleOperators) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: operator.email,
        redirectTo,
      }),
    });

    if (response.ok) {
      resetRequests += 1;
    } else {
      failedRequests += 1;
    }
  }

  if (resetRequests > 0 || failedRequests > 0) {
    await queryRows(
      `
        INSERT INTO audit_event (
          id,
          org_id,
          actor_id,
          action,
          target_type,
          target_id,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          'operator_security.reset_links_requested',
          'operator_security',
          $2,
          $4::jsonb
        )
      `,
      [
        createPrefixedId("ae"),
        orgId,
        session.operator.id,
        JSON.stringify({
          reset_requested_count: resetRequests,
          reset_failed_count: failedRequests,
          target_operator_ids: eligibleOperators.map((operator) => operator.id),
        }),
      ],
      {
        orgId,
        operatorId: session.operator.id,
        serviceRole: true,
      }
    );
  }

  revalidatePath("/admin");

  if (failedRequests > 0) {
    return {
      ok: false,
      message: `${failedRequests} reset request(s) failed.`,
      resetRequests,
      failedRequests,
    };
  }

  return {
    ok: true,
    message: `${resetRequests} reset link(s) requested.`,
    resetRequests,
    failedRequests,
  };
}
