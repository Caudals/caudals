import { z } from "zod";
import { getEvalsPool } from "../repositories/db";

/**
 * The workspaces a background worker serves: the deploy-time list plus every
 * live workspace (evals.worker_workspace_ids(), migration 063), refreshed
 * every 30 s. A new client's uploads, websites, generation and exports are
 * therefore picked up without a redeploy. Tenant isolation is unchanged:
 * every job still runs inside its own workspace scope under RLS. If discovery
 * is unavailable the explicit list keeps working.
 */
export function workerWorkspaces(envValue: string | undefined, refreshMs = 30_000) {
  const configured = z.array(z.uuid()).parse(JSON.parse(envValue ?? "[]"));
  let discovered: string[] = [];
  let checkedAt = 0;
  const current = () => [...new Set([...configured, ...discovered])];
  return {
    configured,
    current,
    has: (orgId: string) => current().includes(orgId),
    async refresh(): Promise<string[]> {
      if (Date.now() - checkedAt < refreshMs) return current();
      checkedAt = Date.now();
      try {
        const rows = (await getEvalsPool().query("SELECT evals.worker_workspace_ids() AS id")).rows as Array<{ id: string }>;
        discovered = rows.map((row) => row.id);
      } catch {
        // Keep the last known set; the explicit list is always served.
      }
      return current();
    },
  };
}
