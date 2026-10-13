/**
 * Per-workspace billing overrides (launch L-14; decision I-11 and the L-12
 * founder note). Platform admins set them through an audited API
 * (billing.set_workspace_override, migration 093); everything else reads them:
 *
 * - enforcement (inherit | shadow | enforce): credit enforcement for this
 *   workspace while BILLING_CREDITS_ENABLED is on, so internal test workspaces
 *   can enforce before any global BILLING_ENFORCE=enforce (lib/billing/engine.ts).
 * - livePayments: live-mode top-ups before Gate B, for the founder's purchase
 *   and the design partners (lib/billing/payments-config.ts).
 * - plansV2: plans v2 for this workspace before PLANS_V2_ENABLED: typed limits
 *   and the upgrade dialog, the monthly allowance and the upgrade on purchase.
 *
 * Reads go through the caller's tenant-scoped transaction (RLS by org_id);
 * the runtime and every worker role may read their own workspace's row.
 */
import type { PoolClient } from "pg";
import { z } from "zod";
import { plansV2Enabled } from "./plans";

type Env = Record<string, string | undefined>;

export type EnforcementOverride = "inherit" | "shadow" | "enforce";
export interface WorkspaceOverride { enforcement: EnforcementOverride; livePayments: boolean; plansV2: boolean }
export const NO_OVERRIDE: WorkspaceOverride = Object.freeze({ enforcement: "inherit", livePayments: false, plansV2: false });

/** This workspace's override, or the defaults when none is set. */
export async function getWorkspaceOverride(db: PoolClient, orgId: string): Promise<WorkspaceOverride> {
  const row = (await db.query("SELECT enforcement,live_payments,plans_v2 FROM billing.workspace_override WHERE org_id=$1", [orgId])).rows[0];
  if (!row) return NO_OVERRIDE;
  return {
    enforcement: row.enforcement === "enforce" ? "enforce" : row.enforcement === "shadow" ? "shadow" : "inherit",
    livePayments: row.live_payments === true, plansV2: row.plans_v2 === true,
  };
}

/** Whether plans v2 applies to this workspace: the global flag, or its override. */
export async function plansV2For(db: PoolClient, orgId: string, env: Env = process.env): Promise<boolean> {
  if (plansV2Enabled(env)) return true;
  if (!orgId) return false;
  return (await getWorkspaceOverride(db, orgId)).plansV2;
}

/* ---------------------------------------------------------- admin API --- */

export const overrideInputSchema = z.strictObject({
  orgId: z.uuid(),
  enforcement: z.enum(["inherit", "shadow", "enforce"]),
  livePayments: z.boolean(),
  plansV2: z.boolean(),
  reason: z.string().trim().min(3).max(2000),
});
export type OverrideInput = z.infer<typeof overrideInputSchema>;

export interface OverrideRecord extends WorkspaceOverride {
  orgId: string; workspace?: string | null; plan?: string | null; billingMode?: string | null;
  reason: string; version: number; updatedBy: string; updatedAt: Date;
}

function record(row: Record<string, unknown>): OverrideRecord {
  return {
    orgId: String(row.org_id), workspace: (row.workspace as string | null | undefined) ?? undefined, plan: (row.plan as string | null | undefined) ?? undefined,
    billingMode: (row.billing_mode as string | null | undefined) ?? undefined,
    enforcement: row.enforcement as EnforcementOverride, livePayments: row.live_payments === true, plansV2: row.plans_v2 === true,
    reason: String(row.reason), version: Number(row.version), updatedBy: String(row.updated_by), updatedAt: new Date(row.updated_at as string),
  };
}

export class OverrideError extends Error {
  constructor(readonly code: "SCOPE_DENIED" | "INPUT_INVALID" | "REASON_REQUIRED" | "WORKSPACE_BUSY") { super(code); this.name = "OverrideError"; }
}
function rethrow(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === "SCOPE_DENIED" || message === "INPUT_INVALID" || message === "REASON_REQUIRED" || message === "WORKSPACE_BUSY") throw new OverrideError(message);
  throw error;
}

/** Platform admins only (checked again in the database), in a transaction scoped to the workspace. Audited there. */
export async function setWorkspaceOverride(db: PoolClient, input: OverrideInput, requestId?: string): Promise<OverrideRecord> {
  try {
    const row = (await db.query("SELECT * FROM billing.set_workspace_override($1,$2,$3,$4,$5,$6)",
      [input.orgId, input.enforcement, input.livePayments, input.plansV2, input.reason, requestId ?? null])).rows[0];
    return record(row);
  } catch (error) { rethrow(error); }
}

/** Every override with its workspace, plan and billing mode (platform admins). */
export async function listWorkspaceOverrides(db: PoolClient): Promise<OverrideRecord[]> {
  try {
    return (await db.query("SELECT * FROM billing.list_workspace_overrides()")).rows.map(record);
  } catch (error) { rethrow(error); }
}

/** Which of these workspaces may top up in live mode before Gate B. */
export async function livePaymentWorkspaces(db: PoolClient, orgIds: readonly string[]): Promise<Set<string>> {
  if (!orgIds.length) return new Set();
  const rows = (await db.query("SELECT billing.live_payments_allowed($1::uuid[]) AS org_id", [orgIds.slice(0, 500)])).rows;
  return new Set(rows.map(row => String(row.org_id).toLowerCase()));
}
