import "server-only";

import { withOperatorDbSession } from "@/lib/db/client";
import {
  PRODUCTION_DB_ELEVATION_SCOPE,
  type OperatorDbElevationScope,
} from "@/lib/db/operator-elevation";
import { createPrefixedId } from "@/lib/operator/ids";

const MIN_ELEVATION_MINUTES = 5;
const MAX_ELEVATION_MINUTES = 120;
const DEFAULT_ELEVATION_MINUTES = 30;

type OperatorElevationRow = {
  id: string;
  org_id: string;
  operator_id: string;
  scope: OperatorDbElevationScope;
  reason: string;
  state: "active" | "revoked";
  expires_at: Date | string;
  audit_event_id?: string | null;
};

export type OperatorElevationGrant = {
  id: string;
  orgId: string;
  operatorId: string;
  scope: OperatorDbElevationScope;
  reason: string;
  state: "active" | "revoked";
  expiresAt: string;
  auditEventId?: string | null;
};

export type GrantOperatorElevationInput = {
  orgId: string;
  operatorId: string;
  reason: string;
  durationMinutes?: number;
  scope?: OperatorDbElevationScope;
  metadata?: Record<string, unknown>;
};

export type RevokeOperatorElevationInput = {
  orgId: string;
  operatorId: string;
  elevationId: string;
  reason?: string;
};

export async function grantOperatorElevation({
  orgId,
  operatorId,
  reason,
  durationMinutes = DEFAULT_ELEVATION_MINUTES,
  scope = PRODUCTION_DB_ELEVATION_SCOPE,
  metadata = {},
}: GrantOperatorElevationInput): Promise<OperatorElevationGrant> {
  const trimmedReason = normalizeReason(reason);
  const normalizedDuration = normalizeDuration(durationMinutes);

  return withOperatorDbSession(
    { orgId, operatorId, serviceRole: true },
    async (client) => {
      const elevationId = createPrefixedId("oe");
      const auditId = createPrefixedId("ae");
      const { rows } = await client.query<OperatorElevationRow>(
        `
          WITH inserted AS (
            INSERT INTO operator_elevation (
              id,
              org_id,
              operator_id,
              scope,
              reason,
              expires_at,
              created_by,
              metadata
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              now() + ($6::int * interval '1 minute'),
              $3,
              $7::jsonb
            )
            RETURNING id, org_id, operator_id, scope, reason, state, expires_at
          ),
          audit AS (
            INSERT INTO audit_event (
              id,
              org_id,
              actor_id,
              action,
              target_type,
              target_id,
              metadata
            )
            SELECT
              $8,
              org_id,
              operator_id,
              'operator_elevation.granted',
              'operator_elevation',
              id,
              jsonb_build_object(
                'scope', scope,
                'reason', reason,
                'duration_minutes', $6::int,
                'expires_at', expires_at
              ) || $7::jsonb
            FROM inserted
            RETURNING id
          )
          SELECT inserted.*, audit.id AS audit_event_id
          FROM inserted
          CROSS JOIN audit
        `,
        [
          elevationId,
          orgId,
          operatorId,
          scope,
          trimmedReason,
          normalizedDuration,
          JSON.stringify(metadata),
          auditId,
        ]
      );

      return mapElevationRow(rows[0]);
    }
  );
}

export async function revokeOperatorElevation({
  orgId,
  operatorId,
  elevationId,
  reason,
}: RevokeOperatorElevationInput): Promise<OperatorElevationGrant | null> {
  const revokeReason = reason?.trim() || "Operator revoked elevation";

  return withOperatorDbSession(
    { orgId, operatorId, serviceRole: true },
    async (client) => {
      const auditId = createPrefixedId("ae");
      const { rows } = await client.query<OperatorElevationRow>(
        `
          WITH revoked AS (
            UPDATE operator_elevation
            SET
              state = 'revoked',
              revoked_at = now(),
              revoked_by = $2
            WHERE id = $3
              AND org_id = $1
              AND operator_id = $2
              AND state = 'active'
              AND deleted_at IS NULL
            RETURNING id, org_id, operator_id, scope, reason, state, expires_at
          ),
          audit AS (
            INSERT INTO audit_event (
              id,
              org_id,
              actor_id,
              action,
              target_type,
              target_id,
              metadata
            )
            SELECT
              $4,
              org_id,
              operator_id,
              'operator_elevation.revoked',
              'operator_elevation',
              id,
              jsonb_build_object(
                'scope', scope,
                'reason', $5,
                'expires_at', expires_at
              )
            FROM revoked
            RETURNING id
          )
          SELECT revoked.*, audit.id AS audit_event_id
          FROM revoked
          CROSS JOIN audit
        `,
        [orgId, operatorId, elevationId, auditId, revokeReason]
      );

      return rows[0] ? mapElevationRow(rows[0]) : null;
    }
  );
}

function normalizeReason(reason: string) {
  const trimmed = reason.trim();

  if (trimmed.length < 10 || trimmed.length > 1000) {
    throw new Error("Operator elevation reason must be 10-1000 characters");
  }

  return trimmed;
}

function normalizeDuration(durationMinutes: number) {
  if (!Number.isInteger(durationMinutes)) {
    throw new Error("Operator elevation duration must be a whole number");
  }

  if (
    durationMinutes < MIN_ELEVATION_MINUTES ||
    durationMinutes > MAX_ELEVATION_MINUTES
  ) {
    throw new Error(
      `Operator elevation duration must be ${MIN_ELEVATION_MINUTES}-${MAX_ELEVATION_MINUTES} minutes`
    );
  }

  return durationMinutes;
}

function mapElevationRow(row: OperatorElevationRow): OperatorElevationGrant {
  return {
    id: row.id,
    orgId: row.org_id,
    operatorId: row.operator_id,
    scope: row.scope,
    reason: row.reason,
    state: row.state,
    expiresAt:
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : row.expires_at,
    auditEventId: row.audit_event_id,
  };
}
