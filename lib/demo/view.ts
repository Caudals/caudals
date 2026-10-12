import type { DemoCase } from "./generate";
import type { DemoAnswer, DemoSummary, DemoVerdict } from "./judge";
import type { Durations } from "./eta";
import type { BrowserState, Phase, RunRow } from "./store";

/** Whether models can serve now: `ok`, `degraded` (the main model is down; a backup answers) or `capacity` (nothing can, runs wait). */
export type ServiceLevel = "ok" | "degraded" | "capacity";

/** Live context for a run's view, computed by the API route. */
export type ViewExtras = {
  position: number | null;
  slots: number;
  durations: Pick<Durations, "p50" | "p90">;
  service: ServiceLevel;
  notifyAvailable: boolean;
};

/** What the visitor's page receives: never the client key, page text or target configuration. */
export type DemoView = {
  id: string;
  phase: Phase;
  error: string | null;
  locale: "en" | "es";
  language: "en" | "es" | null;
  target: { kind: RunRow["target_kind"]; host: string; url: string | null };
  docs: { host: string; url: string };
  pages: Array<{ title: string; url: string }>;
  cases: Array<DemoCase & { answer: DemoAnswer | null; verdict: DemoVerdict | null }>;
  summary: DemoSummary | null;
  browser: { chat: BrowserState; docs: BrowserState; chatFound: boolean };
  version: number;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string;
  claimed: boolean;
  /** When the run left the queue; null while it waits. */
  startedAt: string | null;
  /** Set while the run waits: its place in line (1 = next). */
  queue: { position: number; slots: number } | null;
  /** Typical run durations in seconds, for the ETA ranges the page computes. */
  durations: Pick<Durations, "p50" | "p90">;
  service: ServiceLevel;
  notify: { available: boolean; requested: boolean; sent: boolean };
};

/**
 * Chat widgets often prefix every reply with the bot's name ("Asistente
 * automatizado"). A short first line shared by every answer is that label,
 * not part of the answer.
 */
export function withoutSharedLabel(answers: Record<string, DemoAnswer>): Record<string, DemoAnswer> {
  const texts = Object.values(answers).map((answer) => answer.text).filter(Boolean);
  if (texts.length < 2) return answers;
  const first = (text: string) => text.split("\n")[0].trim();
  const label = first(texts[0]);
  if (!label || label.length > 40 || /[.?!:]$/.test(label) || texts.some((text) => first(text) !== label || !text.includes("\n"))) return answers;
  return Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, answer.text ? { ...answer, text: answer.text.split("\n").slice(1).join("\n").trim() } : answer]));
}

const DEFAULT_EXTRAS: ViewExtras = { position: null, slots: 3, durations: { p50: 240, p90: 480 }, service: "ok", notifyAvailable: false };

export function viewOf(run: RunRow, extras: ViewExtras = DEFAULT_EXTRAS): DemoView {
  const answers = withoutSharedLabel(run.answers);
  return {
    id: run.id,
    phase: run.phase,
    error: run.error_code,
    locale: run.locale,
    language: run.language,
    target: { kind: run.target_kind, host: run.target_host, url: run.target_kind === "website" ? run.target_url : null },
    docs: { host: run.docs_host, url: run.docs_url },
    pages: run.pages.map((page) => ({ title: page.title, url: page.url })),
    cases: run.cases.map((item) => ({ ...item, answer: answers[item.id] ?? null, verdict: run.phase === "done" ? run.verdicts[item.id] ?? null : null })),
    summary: run.phase === "done" ? run.summary : null,
    browser: { chat: run.browser_chat, docs: run.browser_docs, chatFound: run.target_config?.recipe_detected === true },
    version: run.version,
    createdAt: new Date(run.created_at).toISOString(),
    finishedAt: run.finished_at ? new Date(run.finished_at).toISOString() : null,
    expiresAt: new Date(run.expires_at).toISOString(),
    claimed: Boolean(run.claimed_at),
    startedAt: run.started_at ? new Date(run.started_at).toISOString() : run.queued_at ? null : new Date(run.created_at).toISOString(),
    queue: extras.position !== null && run.phase !== "done" && run.phase !== "failed" ? { position: extras.position, slots: extras.slots } : null,
    durations: extras.durations,
    service: extras.service,
    notify: { available: extras.notifyAvailable, requested: Boolean(run.notify_requested_at), sent: Boolean(run.notified_at) },
  };
}
