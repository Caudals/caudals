"use client";

/**
 * Plain-language result labels (docs/evals/grading-engine.md): what a
 * customer reads instead of pass/partial/fail/unscorable. Older report
 * snapshots without a label fall back to the stored outcome.
 */
import type { ReportSnapshot, ResultLabel } from "@/lib/evals/reports/contracts";
import { t, type MessageKey } from "@/lib/evals/messages/en";
import { Badge } from "./primitives";

type Result = ReportSnapshot["results"][number];
type Tone = "pass" | "warn" | "fail" | "info" | "neutral";

export const LABEL_META: Record<ResultLabel, { key: MessageKey; tone: Tone; rank: number }> = {
  incorrect: { key: "labelIncorrect", tone: "fail", rank: 0 },
  not_answered: { key: "labelNotAnswered", tone: "fail", rank: 1 },
  partially_correct: { key: "labelPartiallyCorrect", tone: "warn", rank: 2 },
  test_issue: { key: "labelTestIssue", tone: "info", rank: 3 },
  capture_issue: { key: "labelCaptureIssue", tone: "neutral", rank: 4 },
  not_run: { key: "labelNotRun", tone: "neutral", rank: 5 },
  pending: { key: "labelPending", tone: "info", rank: 6 },
  correct: { key: "labelCorrect", tone: "pass", rank: 7 },
};

export function labelOf(result: Pick<Result, "outcome"> & { label?: ResultLabel }): ResultLabel {
  if (result.label) return result.label;
  return result.outcome === "pass" ? "correct" : result.outcome === "partial" ? "partially_correct" : result.outcome === "fail" ? "incorrect" : "pending";
}

export function ResultBadge({ result }: { result: Pick<Result, "outcome"> & { label?: ResultLabel } }) {
  const meta = LABEL_META[labelOf(result)];
  return (
    <Badge tone={meta.tone} dot>
      {t(meta.key)}
    </Badge>
  );
}

const CATEGORY: Record<string, MessageKey> = {
  no_answer: "categoryNoAnswer",
  wrong_information: "categoryWrongInformation",
  missing_information: "categoryMissingInformation",
  contradicts_source: "categoryContradictsSource",
  off_topic: "categoryOffTopic",
};
export function categoryLabel(category: string | null | undefined) {
  return t(CATEGORY[category ?? ""] ?? "categoryOther");
}

/** Failed and partly correct results counted by why they failed. */
export function failureBreakdown(results: Array<Pick<Result, "outcome"> & { failure_category?: string | null }>) {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (result.outcome !== "fail" && result.outcome !== "partial") continue;
    const category = result.failure_category && CATEGORY[result.failure_category] ? result.failure_category : result.outcome === "partial" ? "missing_information" : "other";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts].map(([category, count]) => ({ category, label: categoryLabel(category), count })).sort((a, b) => b.count - a.count);
}
