/**
 * Plan summary and the admin override endpoints (launch spec v2 §6.5, §6.16;
 * P-09; package L-14).
 *
 * GET /api/evals/v1/billing/plan?orgId= answers every member of the
 * workspace (and platform admins, audited) while plans v2 applies to it; 404
 * otherwise, so the app keeps today's screens when PLANS_V2_ENABLED is off. It
 * says which plan the workspace is on, what counts against each limit, what
 * credits (pay as you go) or a managed plan would unlock, the monthly
 * allowance and, for owners, editors and operators, the balance. The upgrade
 * dialog and the connection cards read it.
 *
 * GET/PUT /api/evals/v1/billing/admin/overrides: platform admins (PUT needs a
 * recent sign-in and an Idempotency-Key); every change is audited in the
 * database. L-16 builds the screen.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { EvalError } from "@/lib/evals/domain/errors";
import type { EvalIdentity } from "@/lib/evals/domain/identity";
import { requireWorkspace } from "@/lib/evals/domain/identity";
import { withTenant } from "@/lib/evals/repositories/db";
import { idempotent } from "@/lib/evals/repositories/evidence";
import { requirePlatformAdmin, requireRecentAuthentication } from "@/lib/evals/repositories/platform";
import { callUrl } from "@/lib/email/links";
import { allowanceKey, allowancePeriod } from "./allowance";
import { listWorkspaceOverrides, OverrideError, overrideInputSchema, plansV2For, setWorkspaceOverride, type OverrideRecord } from "./overrides";
import { paymentsAccessFor } from "./payments-config";
import { connectionUnlock, isPlan, MONTHLY_ALLOWANCE_CREDITS, PAYG_LIMITS, PLAN_LIMIT_KINDS, unlockFor, type Plan, type PlanLimitKind, type Unlock } from "./plans";
import { UCR_PER_CREDIT } from "./units";

type Env = Record<string, string | undefined>;

export interface PlanSummary {
  orgId: string;
  plan: Plan;
  limits: {
    systems: { used: number; limit: number | null };
    questionsPerSet: { limit: number | null };
    runsPerMonth: { used: number; limit: number | null };
    activeRuns: { used: number; limit: number };
    members: { used: number; pending: number; limit: number | null };
    connectionTypes: string[];
    schedules: boolean;
    exports: boolean;
  };
  /** What pay as you go includes, for the dialog's comparison. */
  payg: typeof PAYG_LIMITS;
  /** What lifts each limit from this plan. */
  unlocks: Record<PlanLimitKind, Unlock>;
  /** Per connection type not in the plan: credits or a managed plan. */
  connectionUnlocks: Record<string, Unlock>;
  /** Free and PAYG: 1,000 credits a month, expiring at month end (null on other plans). */
  allowance: { monthlyCredits: number; period: string; granted: boolean; expiresAt: string | null } | null;
  /** Owners, editors and operators (and admins): the balance in whole credits. */
  credits: { available: number; held: number; billingMode: string } | null;
  /** Where the dialog's two actions go: top-up (owners, where payments are open) and the booking page. */
  actions: { addCreditsUrl: string | null; talkToUsUrl: string };
  role: string | null;
}

const ALL_CONNECTIONS = ["website", "openai_compatible", "https_json", "imported_responses", "private_runner", "provider_native"] as const;

/** `null` while plans v2 is off for the workspace (members only: outsiders get 404), so the probe is not a 404 in the console (R3). */
export async function planSummary(identity: EvalIdentity, orgId: string, env: Env = process.env): Promise<PlanSummary | null> {
  await requireWorkspace(identity, orgId, "read");
  const role = identity.workspaces.find(workspace => workspace.id === orgId)?.role ?? null;
  const admin = identity.platformRole === "platform_admin";
  const seesCredits = admin || role === "owner" || role === "editor" || role === "operator";
  const period = allowancePeriod();
  const data = await withTenant({ orgId, actorId: identity.user.id }, async db => {
    if (!await plansV2For(db, orgId, env)) return "off" as const;
    const entitlement = (await db.query(`SELECT plan,max_systems,max_tests_per_set,max_runs_per_month,max_active_runs,max_members,
        allowed_connection_types,can_schedule,can_export FROM evals.workspace_entitlement WHERE org_id=$1`, [orgId])).rows[0];
    const usage = (await db.query("SELECT * FROM evals.plan_usage($1)", [orgId])).rows[0];
    const account = (await db.query("SELECT billing_mode,available_ucr,held_ucr FROM billing.credit_account WHERE org_id=$1", [orgId])).rows[0] ?? null;
    const allowance = (await db.query(`SELECT l.expires_at FROM billing.ledger_entry e JOIN billing.credit_lot l ON l.org_id=e.org_id
        AND l.id=(e.lot_allocations->0->>'lot')::uuid WHERE e.org_id=$1 AND e.idempotency_key=$2`, [orgId, `grant:${allowanceKey(period)}`])).rows[0] ?? null;
    return { entitlement, usage, account, allowance };
  });
  if (data === "off") return null;
  if (!data?.entitlement) throw new EvalError("SCOPE_DENIED", 404);
  const { entitlement, usage, account, allowance } = data;
  const plan: Plan = isPlan(entitlement.plan) ? entitlement.plan : "managed";
  const allowed = (entitlement.allowed_connection_types ?? []) as string[];
  const connectionUnlocks: Record<string, Unlock> = {};
  for (const type of ALL_CONNECTIONS) {
    const unlock = connectionUnlock(plan, allowed, type);
    if (unlock) connectionUnlocks[type] = unlock;
  }
  const unlocks = Object.fromEntries(PLAN_LIMIT_KINDS.map(kind => [kind, unlockFor(plan, kind)])) as Record<PlanLimitKind, Unlock>;
  const access = role === "owner" ? await paymentsAccessFor(orgId, env, { actorId: identity.user.id }) : "closed";
  const whole = (value: unknown) => Number(BigInt(String(value ?? 0)) / UCR_PER_CREDIT);
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    orgId, plan, role,
    limits: {
      systems: { used: Number(usage.systems), limit: num(entitlement.max_systems) },
      questionsPerSet: { limit: num(entitlement.max_tests_per_set) },
      runsPerMonth: { used: Number(usage.runs_this_month), limit: num(entitlement.max_runs_per_month) },
      activeRuns: { used: Number(usage.active_runs), limit: Number(entitlement.max_active_runs) },
      members: { used: Number(usage.members), pending: Number(usage.pending_invitations), limit: num(entitlement.max_members) },
      connectionTypes: allowed, schedules: Boolean(entitlement.can_schedule), exports: Boolean(entitlement.can_export),
    },
    payg: PAYG_LIMITS, unlocks, connectionUnlocks,
    allowance: plan === "free" || plan === "payg"
      ? { monthlyCredits: MONTHLY_ALLOWANCE_CREDITS, period, granted: Boolean(allowance), expiresAt: allowance ? new Date(allowance.expires_at).toISOString() : null }
      : null,
    credits: seesCredits && account ? { available: whole(account.available_ucr), held: whole(account.held_ucr), billingMode: String(account.billing_mode) } : null,
    actions: {
      addCreditsUrl: access !== "closed" ? `/workspace/billing/top-up?orgId=${encodeURIComponent(orgId)}` : null,
      talkToUsUrl: callUrl(env),
    },
  };
}

/* ------------------------------------------------------------ overrides --- */

function overrideView(record: OverrideRecord) {
  return {
    orgId: record.orgId, workspace: record.workspace ?? null, plan: record.plan ?? null, billingMode: record.billingMode ?? null,
    enforcement: record.enforcement, livePayments: record.livePayments, plansV2: record.plansV2,
    reason: record.reason, version: record.version, updatedBy: record.updatedBy, updatedAt: record.updatedAt.toISOString(),
  };
}

function overrideApiError(error: unknown): never {
  if (error instanceof OverrideError) {
    if (error.code === "WORKSPACE_BUSY") throw new EvalError("WORKSPACE_BUSY", 409, "Credit enforcement can change only while no run is queued or running in the workspace.");
    if (error.code === "SCOPE_DENIED") throw new EvalError("SCOPE_DENIED", 404);
    throw new EvalError("INPUT_INVALID", 422, "Give a reason of 3 to 2,000 characters and valid settings.");
  }
  throw error;
}

export async function listOverridesForAdmin(identity: EvalIdentity) {
  requirePlatformAdmin(identity);
  return (await withTenant({ orgId: "", actorId: identity.user.id }, db => listWorkspaceOverrides(db)).catch(overrideApiError)).map(overrideView);
}

export async function setOverrideForAdmin(request: Request, identity: EvalIdentity, body: unknown) {
  requireRecentAuthentication(identity);
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!key || key.length > 160) throw new EvalError("INPUT_INVALID", 400, "Idempotency-Key required.");
  const input = overrideInputSchema.parse(body);
  const scope = { orgId: input.orgId, actorId: identity.user.id };
  const requestId = randomUUID();
  return withTenant(scope, db => idempotent(db, scope, "billing-admin-overrides", key, input, async () =>
    overrideView(await setWorkspaceOverride(db, input, requestId)))).catch(overrideApiError);
}
