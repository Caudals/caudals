import "server-only";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import type { RunRow } from "./store";

/**
 * The demo's server-side funnel events (spec §4.20). L-02 owns the event
 * taxonomy; the demo emits its two events from here only. No personal data:
 * no URL, host, address or run id.
 */

type DemoEvent = "demo_started" | "demo_finished";

function emit(name: DemoEvent, run: RunRow, payload: Record<string, string | number | boolean | null>) {
  void recordProductEvent({
    eventName: name,
    source: "server",
    path: `/${run.locale}/demo`,
    payload,
  }).catch(() => {});
}

const seconds = (from: Date | string | null, to: Date | string | null = new Date()) =>
  from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)) : null;

/** A run left the queue for the first time (or started at once). */
export function demoStarted(run: RunRow) {
  emit("demo_started", run, {
    target_kind: run.target_kind,
    docs_given: run.target_kind !== "website" || run.docs_url !== run.target_url,
    locale: run.locale,
    queue_wait_s: seconds(run.queued_at ?? run.created_at, run.started_at ?? run.created_at) ?? 0,
  });
}

/** A run ended, done or failed; failures carry their reason. */
export function demoFinished(run: RunRow) {
  emit("demo_finished", run, {
    outcome: run.phase === "done" ? "done" : "failed",
    error_code: run.error_code,
    duration_s: seconds(run.started_at ?? run.created_at, run.finished_at),
    scored: run.summary?.scored ?? null,
    correct: run.summary?.correct ?? null,
    model_used: run.model_used,
    target_kind: run.target_kind,
    locale: run.locale,
    fallback_cost_eur: Number(run.fallback_cost_eur ?? 0),
  });
}
