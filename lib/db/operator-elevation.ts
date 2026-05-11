import "server-only";

import type { PoolClient } from "pg";

export const PRODUCTION_DB_ELEVATION_SCOPE = "production_db";

export type OperatorDbElevationScope = typeof PRODUCTION_DB_ELEVATION_SCOPE;

export type OperatorElevationSession = {
  orgId: string;
  operatorId?: string | null;
  serviceRole?: boolean;
  elevationScope?: OperatorDbElevationScope | null;
};

export async function assertActiveOperatorElevation(
  client: PoolClient,
  session: OperatorElevationSession
) {
  if (!session.elevationScope) {
    return;
  }

  if (!session.serviceRole) {
    throw new Error(
      "Operator DB elevation can only be required for service-role sessions"
    );
  }

  if (!session.operatorId) {
    throw new Error(
      "Operator DB elevation requires an authenticated operator id"
    );
  }

  const { rowCount } = await client.query(
    `
      SELECT 1
      FROM operator_elevation
      WHERE org_id = $1
        AND operator_id = $2
        AND scope = $3
        AND state = 'active'
        AND expires_at > now()
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [session.orgId, session.operatorId, session.elevationScope]
  );

  if (rowCount === 0) {
    throw new Error(
      `Active ${session.elevationScope} operator elevation is required`
    );
  }
}
