import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  assertActiveOperatorElevation,
  type OperatorDbElevationScope,
} from "@/lib/db/operator-elevation";
import { getDatabaseUrlFromEnv } from "@/lib/env/database-url";

export type QueryValue =
  | string
  | number
  | boolean
  | Date
  | Buffer
  | null
  | QueryValue[];

export type OperatorDbSession = {
  orgId: string;
  operatorId?: string | null;
  serviceRole?: boolean;
  elevationScope?: OperatorDbElevationScope | null;
};

export type DbQueryClient = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: QueryValue[]
  ): Promise<{ rows: T[] }>;
};

let pool: Pool | null = null;

export function getDatabaseUrl() {
  return getDatabaseUrlFromEnv();
}

export function getPostgresPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return pool;
}

export async function withOperatorDbSession<T>(
  session: OperatorDbSession,
  callback: (client: PoolClient) => Promise<T>,
  sourcePool = getPostgresPool()
) {
  const client = await sourcePool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        SELECT
          set_config('app.current_org_id', $1, true),
          set_config('app.current_operator_id', $2, true),
          set_config('app.is_service_role', $3, true)
      `,
      [
        session.orgId,
        session.operatorId ?? "",
        session.serviceRole ? "true" : "false",
      ]
    );
    await assertActiveOperatorElevation(client, session);

    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function queryRows<T extends QueryResultRow>(
  text: string,
  values: QueryValue[] = [],
  session?: OperatorDbSession
): Promise<T[]> {
  if (session) {
    return withOperatorDbSession(session, async (client) => {
      const result = await client.query<T>(text, values);
      return result.rows;
    });
  }

  const result = await getPostgresPool().query<T>(text, values);
  return result.rows;
}

export async function closePostgresPoolForTests() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
