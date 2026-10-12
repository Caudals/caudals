/**
 * Weekly growth targets from spec v2 §7.11 (re-set after four weeks of data).
 * The stage in force is read at runtime from GROWTH_TARGET_STAGE; until the
 * founder moves it, the Gate A column applies.
 */
export const TARGET_STAGES = ["gate_a", "gate_b", "launch_4w", "launch_12w"] as const;
export type TargetStage = (typeof TARGET_STAGES)[number];

export type GrowthTargets = {
  sessions: number;
  demoStarts: number;
  demoSuccess: number;
  newAccounts: number;
  activation: number;
  snapshotsShared: number;
  payingCustomers: number;
  demoP50Seconds: number;
};

export const GROWTH_TARGETS: Record<TargetStage, GrowthTargets> = {
  gate_a: { sessions: 150, demoStarts: 15, demoSuccess: 0.85, newAccounts: 3, activation: 0.3, snapshotsShared: 15, payingCustomers: 0, demoP50Seconds: 300 },
  gate_b: { sessions: 250, demoStarts: 40, demoSuccess: 0.9, newAccounts: 6, activation: 0.35, snapshotsShared: 25, payingCustomers: 1, demoP50Seconds: 240 },
  launch_4w: { sessions: 400, demoStarts: 80, demoSuccess: 0.9, newAccounts: 12, activation: 0.4, snapshotsShared: 25, payingCustomers: 5, demoP50Seconds: 240 },
  launch_12w: { sessions: 500, demoStarts: 100, demoSuccess: 0.92, newAccounts: 15, activation: 0.45, snapshotsShared: 25, payingCustomers: 10, demoP50Seconds: 240 },
};

export function targetStage(env: Record<string, string | undefined> = process.env): TargetStage {
  const value = env.GROWTH_TARGET_STAGE as TargetStage | undefined;
  return value && (TARGET_STAGES as readonly string[]).includes(value) ? value : "gate_a";
}

/** The platform-wide aggregates returned by evals.ops_digest_data (migration 090). */
export type OpsDigestData = {
  from: string;
  to: string;
  funnel: {
    sessions: number;
    page_views: number;
    demo_starts: number;
    demo_finished: number;
    demo_succeeded: number;
    demo_p50_s: number | null;
    new_accounts: number;
    activation_cohort: number;
    activation_activated: number;
    runs_started: number;
    reports_viewed: number;
    snapshots_created: number;
    snapshots_shared: number;
    paying_customers: number;
    purchases_recorded: boolean;
    credits_sold: number | null;
  };
  demo_failures: Array<{ reason: string; count: number }>;
  demo_queue: number;
  stuck_runs: Array<{ orgId: string; runId: string; workspace: string; status: string; phase: string; since: string }>;
  stuck_run_count: number;
  old_holds: Array<{ orgId: string; workspace: string; holds: number; credits: number; since: string }>;
  low_balance: Array<{ orgId: string; workspace: string; credits: number }>;
  signups: Array<{ orgId: string; company: string; source: string; createdAt: string; domain: string | null; stage: string }>;
};

/** A ratio, or null when there is nothing to divide (never an invented 0 %). */
export function ratio(part: number, whole: number) {
  return whole > 0 ? part / whole : null;
}
