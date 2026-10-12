import type { ReportSnapshot, ResultLabel } from "../reports/contracts";

/**
 * Shape of a built example fixture (`./fixtures/{en,es}.json`). Type-only and
 * free of Node imports, so client components and the UI harness can use it.
 */
export type ExampleLocale = "en" | "es";

export type ExampleTrendPoint = {
  run_id: string;
  report_revision_id: string;
  started_at: string;
  finished_at: string;
  review_status: "preliminary" | "reviewed";
  strict_pass_rate: number | null;
  n_scorable: number;
  n_pass: number;
  n_partial: number;
  n_fail: number;
  n_unscorable: number;
  critical_failures: number;
};

export type ExampleChange = {
  case_revision_id: string;
  title: string;
  /** The candidate (latest) run's assessment, so the change opens that result. */
  assessment_id: string;
  direction: "improved" | "regressed";
  before: ResultLabel;
  after: ResultLabel;
};

export type ExampleComparison = {
  baseline_run_id: string;
  candidate_run_id: string;
  baseline_started_at: string;
  candidate_started_at: string;
  status: "compatible" | "inconclusive";
  improved: number;
  regressed: number;
  unchanged: number;
  unassessed: number;
  changes: ExampleChange[];
};

export type ExampleBundle = {
  schema: "caudals.example/1";
  version: string;
  locale: ExampleLocale;
  company: { name: string; product: string };
  sources: Array<{ id: string; title: string }>;
  /** August, September and October, oldest first. The last one is the reviewed report. */
  runs: [ReportSnapshot, ReportSnapshot, ReportSnapshot];
  trend: ExampleTrendPoint[];
  comparison: ExampleComparison;
};
