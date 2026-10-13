/**
 * Plans v2: free → pay as you go → managed (launch spec v2 §6.5, §6.18;
 * P-09; package L-14). Pure definitions shared by the server and the
 * client: the plan limits, what unlocks each limit, the typed PLAN_LIMIT_*
 * errors and the PLANS_V2_ENABLED flag (read on the server only and passed on
 * as data; never NEXT_PUBLIC_*).
 *
 * The database enforces the limits (migrations 075 and 093); these constants
 * describe them for the plan summary and the upgrade dialog. The PAYG values
 * are the ones evals.upgrade_plan_on_purchase applies.
 */
type Env = Record<string, string | undefined>;

export type Plan = "free" | "payg" | "managed" | "partner";
export const PLANS: readonly Plan[] = ["free", "payg", "managed", "partner"];
export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

/**
 * PLANS_V2_ENABLED: switched on at Gate B. On: typed limit errors and the
 * upgrade dialog, the monthly allowance for every free and PAYG workspace,
 * free → PAYG on the first purchase and live-mode top-ups for every owner.
 * Off: today's behaviour, except for workspaces an admin overrides
 * (billing.workspace_override.plans_v2 and live_payments).
 */
export function plansV2Enabled(env: Env = process.env): boolean {
  return env.PLANS_V2_ENABLED === "true";
}

/** The monthly allowance of free and PAYG workspaces (§6.5, D-08): expires at month end, no cash value. */
export const MONTHLY_ALLOWANCE_CREDITS = 1000;

/** Connection types as stored in workspace_entitlement.allowed_connection_types. */
export type ConnectionType = "website" | "openai_compatible" | "provider_native" | "https_json" | "imported_responses" | "private_runner";

export interface PlanLimits {
  /** AI systems (connections) at once; null = no cap. */
  systems: number | null;
  /** Questions per generated test set; null = no cap. */
  questionsPerSet: number | null;
  /** Runs started per calendar month; null = limited by credits and caps only. */
  runsPerMonth: number | null;
  /** Runs at the same time (more wait in the queue). */
  activeRuns: number;
  /** Owners, editors and viewers; null = no cap. */
  members: number | null;
  connectionTypes: readonly ConnectionType[];
  schedules: boolean;
  /** Pages one website source may read, e.g. an imported help centre (§6.5, P-56; launch L-34). */
  websitePages: number;
}

/** The free plan as enrolled by evals.enroll_self_serve (migrations 075, 085). */
export const FREE_LIMITS: PlanLimits = Object.freeze({
  systems: 1, questionsPerSet: 50, runsPerMonth: 3, activeRuns: 1, members: null,
  connectionTypes: Object.freeze(["website", "openai_compatible", "https_json"] as ConnectionType[]), schedules: false,
  websitePages: 50,
});

/** Pay as you go (§6.5), as evals.upgrade_plan_on_purchase sets it (migration 093). */
export const PAYG_LIMITS: PlanLimits = Object.freeze({
  systems: 10, questionsPerSet: 500, runsPerMonth: null, activeRuns: 2, members: 10,
  connectionTypes: Object.freeze(["https_json", "imported_responses", "openai_compatible", "website"] as ConnectionType[]), schedules: true,
  websitePages: 200,
});

/**
 * Pages one website source may read (launch L-34). Plans v2 sets 50 on free
 * and 200 on pay as you go; managed and partner workspaces get the PAYG cap
 * (their contracts set the volume). Without plans v2 every workspace keeps
 * today's 50-page reader cap.
 */
export const DEFAULT_WEBSITE_PAGE_CAP = 50;
export function websitePageCap(plan: string | null | undefined, plansV2: boolean): number {
  if (!plansV2) return DEFAULT_WEBSITE_PAGE_CAP;
  return plan === "free" ? FREE_LIMITS.websitePages : PAYG_LIMITS.websitePages;
}

/* ------------------------------------------------------- limit errors --- */

export type PlanLimitKind = "systems" | "runs" | "questions" | "connection" | "schedules" | "members";
export const PLAN_LIMIT_KINDS: readonly PlanLimitKind[] = ["systems", "runs", "questions", "connection", "schedules", "members"];
export const PLAN_LIMIT_CODES: Readonly<Record<PlanLimitKind, string>> = Object.freeze({
  systems: "PLAN_LIMIT_SYSTEMS", runs: "PLAN_LIMIT_RUNS", questions: "PLAN_LIMIT_QUESTIONS",
  connection: "PLAN_LIMIT_CONNECTION", schedules: "PLAN_LIMIT_SCHEDULES", members: "PLAN_LIMIT_MEMBERS",
});

/** The kind behind a PLAN_LIMIT_* code, or null. */
export function planLimitKind(code: unknown): PlanLimitKind | null {
  if (typeof code !== "string") return null;
  return PLAN_LIMIT_KINDS.find(kind => PLAN_LIMIT_CODES[kind] === code) ?? null;
}

/** API messages (English; the app shows its own EN/ES dialog for every PLAN_LIMIT_* code). */
export const PLAN_LIMIT_MESSAGES: Readonly<Record<PlanLimitKind, string>> = Object.freeze({
  systems: "This workspace has reached its plan's number of AI systems.",
  runs: "This workspace has used its plan's runs for this month.",
  questions: "This test set is larger than the workspace's plan allows.",
  connection: "This connection type is not included in the workspace's plan.",
  schedules: "Scheduled monitoring is not included in the workspace's plan.",
  members: "This workspace has reached its plan's number of members.",
});

/** What lifts a limit: credits (pay as you go) when PAYG includes more, otherwise a managed plan. */
export type Unlock = "credits" | "managed";

export function unlockFor(plan: Plan, kind: PlanLimitKind, connectionType?: string | null): Unlock {
  if (plan !== "free") return "managed";
  if (kind === "connection") return connectionType && (PAYG_LIMITS.connectionTypes as readonly string[]).includes(connectionType) ? "credits" : "managed";
  return "credits";
}

/** A connection type the plan does not include: what would unlock it (null when it is included). */
export function connectionUnlock(plan: Plan, allowed: readonly string[], connectionType: string): Unlock | null {
  return allowed.includes(connectionType) ? null : unlockFor(plan, "connection", connectionType);
}

export interface PlanLimitView { kind: PlanLimitKind; limit: number | null; connectionType: string | null }
