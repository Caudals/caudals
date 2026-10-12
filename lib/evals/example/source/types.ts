/**
 * Authoring types for the example evaluation (launch L-33, spec P-55).
 *
 * Every user-facing string is written in English and Spanish side by side so
 * the two fixtures cannot drift. `{co}` and `{product}` are replaced by the
 * fictitious company and product names (./company.ts) when the fixtures are
 * built, so a rename after the founder's name check is one line.
 */
export type Text = { en: string; es: string };

export type ExampleLabel = "correct" | "partially_correct" | "incorrect" | "not_answered" | "test_issue" | "capture_issue";
export type FactStatus = "present" | "missing" | "contradicted" | null;
export type FailureCategory = "no_answer" | "wrong_information" | "missing_information" | "contradicts_source" | "off_topic";
export type LikelyCause = "invented_answer" | "outdated_document" | "wrong_source" | "knowledge_gap" | "out_of_scope";
export type Severity = "low" | "medium" | "high" | "critical";
export type TopicId = "cover" | "exclusions" | "excess" | "claims" | "payments" | "changes" | "scope";

/** One recorded answer and its grade. A case has one variant per distinct answer across the three runs. */
export type Variant = {
  label: ExampleLabel;
  output: Text;
  rationale: Text;
  /** Status of each of the case's key facts, in order. */
  facts: FactStatus[];
  category?: FailureCategory;
  cause?: LikelyCause;
  contradictions?: Text[];
  unsupported?: Text[];
  offered?: Text[];
  confidence?: "high" | "medium" | "low";
  gradedBy?: "judge" | "precheck";
};

export type ExampleCase = {
  /** Stable short id, `c01`…`c48`. */
  id: string;
  topic: TopicId;
  severity: Severity;
  title: Text;
  question: Text;
  expected: Text;
  facts: Text[];
  source: { doc: DocumentId; anchor: string };
  variants: Record<string, Variant>;
  /** Variant key for the August, September and October runs. */
  runs: readonly [string, string, string];
};

export type DocumentId = "conditions" | "faq" | "limits" | "assistance" | "guidelines";
