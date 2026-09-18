import "server-only";
import { Pool, type PoolClient } from "pg";
import { getSecretEnvValue } from "@/lib/env/secrets";

let pool: Pool | undefined;
export function getEvalsPool() {
  if (!pool) {
    const connectionString = getSecretEnvValue("EVALS_DATABASE_URL");
    if (!connectionString) throw new Error("Evaluation database is not configured");
    pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  }
  return pool;
}
export type TenantContext = { orgId: string; actorId: string };
export async function withTenant<T>(context: TenantContext, callback: (client: PoolClient) => Promise<T>, source = getEvalsPool()): Promise<T> {
  const client = await source.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ unsafe: boolean }>(`SELECT r.rolsuper OR r.rolbypassrls OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='evals' AND n.nspowner=r.oid) AS unsafe FROM pg_roles r WHERE r.rolname=current_user`);
    if (rows[0]?.unsafe !== false) throw new Error("Evaluation runtime must be a non-owner NOBYPASSRLS role");
    await client.query("SELECT set_config('evals.org_id',$1,true),set_config('evals.actor_id',$2,true),set_config('statement_timeout','10000',true)", [context.orgId, context.actorId]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}
