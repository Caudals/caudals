import { tr } from "@/lib/evals/messages/phrases";
/**
 * Customer-facing projection of an evaluation's separate state dimensions
 * (preparation, run execution, publication — spec §12.1) into one stage a
 * person can act on. The underlying states stay separate in the database; this
 * only chooses the sentence and the next step. Spec §5.3.
 */
import type { Tone } from "./primitives";

export type StageKey =
  | "setup"
  | "preparing"
  | "needs_input"
  | "review_tests"
  | "ready"
  | "queued"
  | "running"
  | "paused"
  | "finalizing"
  | "results"
  | "failed"
  | "canceled";

export type Stage = {
  key: StageKey;
  label: string;
  tone: Tone;
  live: boolean;
  /** Which of Connect · Prepare · Run · Results is current (0–3). */
  step: 0 | 1 | 2 | 3;
  /** Whether the next move belongs to the customer. */
  needsAction: boolean;
};

type Input = {
  preparation_status: string;
  selected_suite_version_id: string | null;
  latest_run_status: string | null;
  source_ids?: string[];
  latest_source_id?: string | null;
  reason_code?: string | null;
  latest_run_execution_mode?: string | null;
  latest_run_reason_code?: string | null;
};

const PREPARING = new Set(["checking_connection", "ingesting", "profiling", "generating", "validating"]);
const RUNNING = new Set(["queued", "running", "pause_requested", "cancel_requested"]);

export function evaluationStage(evaluation: Input, hasReport: boolean): Stage {
  const run = evaluation.latest_run_status;
  if (run) {
    if (run === "queued") return { key: "queued", label: tr("Queued"), tone: "info", live: true, step: 2, needsAction: false };
    if (RUNNING.has(run)) return { key: "running", label: tr("Running"), tone: "info", live: true, step: 2, needsAction: false };
    if (run === "paused" && evaluation.latest_run_execution_mode === "imported_responses")
      return { key: "paused", label: tr("Waiting for your answers"), tone: "warn", live: false, step: 2, needsAction: true };
    if (run === "paused" && evaluation.latest_run_reason_code === "runner_wait")
      return { key: "paused", label: tr("Waiting for your runner"), tone: "warn", live: false, step: 2, needsAction: true };
    if (run === "paused") return { key: "paused", label: tr("Paused"), tone: "warn", live: false, step: 2, needsAction: true };
    if (run === "failed") return { key: "failed", label: tr("Failed"), tone: "fail", live: false, step: 2, needsAction: true };
    if (run === "canceled") return hasReport
      ? { key: "results", label: tr("Results ready"), tone: "pass", live: false, step: 3, needsAction: false }
      : { key: "canceled", label: tr("Cancelled"), tone: "neutral", live: false, step: 2, needsAction: false };
    if (hasReport) return { key: "results", label: tr("Results ready"), tone: "pass", live: false, step: 3, needsAction: false };
    return { key: "finalizing", label: tr("Finalizing results"), tone: "info", live: true, step: 3, needsAction: false };
  }
  const prep = evaluation.preparation_status;
  if (evaluation.selected_suite_version_id || prep === "ready")
    return { key: "ready", label: tr("Ready to run"), tone: "pass", live: false, step: 2, needsAction: true };
  if (prep === "needs_review" && /validation|quarantin|^model_/.test(evaluation.reason_code ?? ""))
    return { key: "needs_input", label: tr("Draft needs another try"), tone: "warn", live: false, step: 1, needsAction: true };
  if (prep === "needs_review") return { key: "review_tests", label: tr("Review test set"), tone: "warn", live: false, step: 1, needsAction: true };
  if (prep === "needs_input") return { key: "needs_input", label: tr("Needs your input"), tone: "warn", live: false, step: 1, needsAction: true };
  if (PREPARING.has(prep)) return { key: "preparing", label: tr("Preparing tests"), tone: "info", live: true, step: 1, needsAction: false };
  if (prep === "failed") return { key: "failed", label: tr("Preparation failed"), tone: "fail", live: false, step: 1, needsAction: true };
  if (prep === "canceled") return { key: "canceled", label: tr("Cancelled"), tone: "neutral", live: false, step: 1, needsAction: false };
  const hasSources = !!evaluation.source_ids?.length || !!evaluation.latest_source_id;
  return { key: "setup", label: hasSources ? "Generate the test set" : "Add reference material", tone: "neutral", live: false, step: 1, needsAction: true };
}

export const STEP_LABELS = ["Connect", "Prepare tests", "Run", "Results"] as const;

export function stepStates(stage: Stage) {
  return STEP_LABELS.map((label, index) => ({
    label,
    state:
      index < stage.step || (index === 3 && stage.key === "results")
        ? ("done" as const)
        : index === stage.step
          ? stage.tone === "fail" || stage.key === "needs_input" || stage.label === "Paused"
            ? ("blocked" as const)
            : ("current" as const)
          : ("upcoming" as const),
  }));
}
