/**
 * Who sees the customer billing screens (launch L-15, spec v2 §6.12, §6.18).
 *
 * Every customer-visible billing surface (Settings → Billing and usage, the
 * sidebar balance pill, the run estimate dialog, the low-balance banner, the
 * paused-for-credits top-up, billing notices) shows only when all of these
 * hold, read on the server at request time:
 *
 *   1. BILLING_UI_ENABLED is exactly "true" (default off; the screens' own
 *      kill switch), and BILLING_CREDITS_ENABLED is "true";
 *   2. the workspace is eligible: PLANS_V2_ENABLED (Gate B, every workspace),
 *      or its admin override opens plans v2 or live payments for it (L-14,
 *      billing.workspace_override), or it is an internal test workspace in
 *      BILLING_TEST_WORKSPACE_IDS (Stripe test mode, L-12).
 *
 * So before Gate B no real customer sees balances or top-ups: only the
 * workspaces an admin allowlisted (the founder's, then the design partners)
 * and Caudals' own test workspaces.
 *
 * Within an eligible workspace (§6.12): owners see everything, editors (and
 * Caudals operators on the workspace) the balance and usage, viewers nothing.
 * Platform admins may read for support (audited by requireWorkspace).
 *
 * No React and no "server-only": the evals scheduler imports the eligibility
 * check for billing alerts.
 */
import type { PoolClient } from "pg";
import { billingCreditsEnabled } from "./config";
import { getWorkspaceOverride } from "./overrides";
import { testWorkspaceIds } from "./payments-config";
import { plansV2Enabled } from "./plans";

type Env = Record<string, string | undefined>;

/** BILLING_UI_ENABLED (and the credit layer): the billing screens may show at all. */
export function billingUiEnabled(env: Env = process.env): boolean {
  return env.BILLING_UI_ENABLED?.trim() === "true" && billingCreditsEnabled(env);
}

/** Whether billing shows for this workspace, inside the caller's transaction scoped to it (RLS reads its override). */
export async function billingUiEligible(db: PoolClient, orgId: string, env: Env = process.env): Promise<boolean> {
  if (!billingUiEnabled(env) || !orgId) return false;
  if (plansV2Enabled(env)) return true;
  if (testWorkspaceIds(env).has(orgId.toLowerCase())) return true;
  const override = await getWorkspaceOverride(db, orgId);
  return override.plansV2 || override.livePayments;
}

/** What a person sees of billing in a workspace (§6.12). */
export type BillingLevel = "owner" | "editor";

/**
 * The billing level of a membership role: owners everything; editors and
 * Caudals operators the balance and usage; viewers (and anyone else) nothing.
 * Platform admins read at owner level for support, but never act as owners.
 */
export function billingLevel(role: string | null | undefined, platformAdmin: boolean): BillingLevel | null {
  if (platformAdmin || role === "owner") return "owner";
  if (role === "editor" || role === "operator") return "editor";
  return null;
}
