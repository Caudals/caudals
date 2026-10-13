import type { MessageKey } from "@/lib/evals/messages/en";

/**
 * Connection health and score history per system (launch L-22, spec P-12,
 * P-14), projected from the customer-safe workspace summary. Pure and
 * client-safe: Home, Systems and the evaluation's Connect step share it.
 */

export type HealthSystem = {
  id: string;
  document: { kind: string };
  connection_status: string | null;
  runner_status: string | null;
  error_code?: string | null;
  connection_ok_at?: string | null;
  runner_seen_at?: string | null;
};

/** `connected` and `needs_attention` are the two settled states; the rest are transient or not applicable. */
export type SystemHealth = "connected" | "needs_attention" | "checking" | "not_checked" | "manual";

/** The words for each health state (the badge tone comes from the status table). */
export const HEALTH_LABEL: Record<SystemHealth, MessageKey> = {
  connected: "healthConnected",
  needs_attention: "healthNeedsAttention",
  checking: "healthChecking",
  not_checked: "healthNotChecked",
  manual: "manualUploads",
};

const API_KINDS = new Set(["openai_compatible", "provider_native", "https_json"]);

export function isApiKind(kind: string) {
  return API_KINDS.has(kind);
}

/** Systems whose connection Caudals can probe ("Check now"): website chats and APIs. */
export function canCheckConnection(kind: string) {
  return kind === "website" || API_KINDS.has(kind);
}

export function systemHealth(system: HealthSystem): SystemHealth {
  const kind = system.document.kind;
  if (kind === "imported_responses") return "manual";
  if (kind === "private_runner")
    return system.runner_status === "connected" || system.runner_status === "paired" ? "connected" : "needs_attention";
  const status = system.connection_status;
  if (status === "ready") return "connected";
  if (status === "queued" || status === "running") return "checking";
  if (!status) return "not_checked";
  return "needs_attention";
}

/** When the connection last answered: a successful check, or a private runner's last contact. */
export function lastHealthy(system: HealthSystem) {
  return system.document.kind === "private_runner" ? system.runner_seen_at ?? null : system.connection_ok_at ?? null;
}

/**
 * Where "Fix" goes: re-teach a website chat in the live browser, update an
 * API key (or endpoint), or pair a private runner again.
 */
export function fixAction(system: HealthSystem): "reteach" | "key" | "pair" | null {
  if (systemHealth(system) !== "needs_attention") return null;
  if (system.document.kind === "website") return "reteach";
  if (API_KINDS.has(system.document.kind)) return "key";
  if (system.document.kind === "private_runner") return "pair";
  return null;
}

export type ScoredReport = {
  id: string;
  evaluation_id: string;
  target_id?: string | null;
  strict_pass_rate?: number | null;
  run_created_at?: string | null;
  revision_created_at?: string | null;
  updated_at?: string | null;
};
export type ScorePoint = { reportId: string; rate: number; at: string | null };

const when = (report: ScoredReport) => report.run_created_at ?? report.revision_created_at ?? report.updated_at ?? "";

/** The latest scored reports matching `match`, newest first, at most `limit` (three for a trend). */
export function scoreHistory(reports: ScoredReport[], match: (report: ScoredReport) => boolean, limit = 3): ScorePoint[] {
  return reports
    .filter((report) => match(report) && report.strict_pass_rate != null)
    .sort((a, b) => when(b).localeCompare(when(a)) || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map((report) => ({ reportId: report.id, rate: report.strict_pass_rate as number, at: when(report) || null }));
}

/** Change between the oldest and newest of the trend, in whole percentage points; null with fewer than two runs. */
export function trendPoints(history: ScorePoint[]) {
  if (history.length < 2) return null;
  return Math.round(history[0].rate * 100) - Math.round(history[history.length - 1].rate * 100);
}
