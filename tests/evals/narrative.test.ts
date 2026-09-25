import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildReportSnapshot } from "../../lib/evals/reports/contracts";
import { aggregateRun } from "../../lib/evals/scoring/aggregate";
import { evidencePacket, validateNarrative } from "../../lib/evals/reports/narrative";

function snapshot(pending = false) {
  const results = [0, 1, 2, 3].map((index) => ({
    case_revision_id: randomUUID(), title: `Case ${index}`, topic: "fees", severity: "medium" as const,
    outcome: index < 3 ? "pass" as const : "fail" as const, assessment_id: `a${index}`, observation_id: randomUUID(),
    input: "q", output: "a", rationale: "r", source_refs: [], review_status: "unreviewed",
  }));
  const now = new Date().toISOString();
  return buildReportSnapshot({
    schema_version: "1.0", report_revision_id: randomUUID(), run_id: randomUUID(), created_at: now,
    system: { name: "Synthetic assistant", target_revision_id: randomUUID(), purpose: "Fixture", execution_mode: "deployed_system" },
    scope: { suite_version_id: randomUUID(), evidence_policy: "source_grounded", started_at: now, finished_at: now, languages: ["en"], review_status: "preliminary" },
    metrics: aggregateRun(results.map((result, index) => ({ id: result.case_revision_id, familyId: `f${index}`, eligible: true,
      executionStatus: pending && index === 3 ? "pending" : "succeeded", outcome: pending && index === 3 ? undefined : result.outcome, severity: "medium" }))),
    findings: [{ id: "f-rounding", title: "Rounding errors", severity: "medium", evidence_strength: "observed", frequency_n: 1, frequency_denominator: 4,
      observation: "One answer rounded twice.", cause_hypothesis: null, recommendation: "Clarify the rounding rule.", assessment_ids: ["a3"] }],
    results, improvements: [],
    methodology: { cef_version: "1.0", scorer_version: "v1", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "all", exclusions: [], review_coverage: "none", cost: null,
      limitations: pending ? ["Coverage is incomplete."] : [] },
  });
}
const output = (takeaways: unknown[]) => ({ text: JSON.stringify({ takeaways }), complete: true });

describe("§15.1 bounded report narrative", () => {
  it("builds the evidence packet from the snapshot only", () => {
    const packet = evidencePacket(snapshot());
    expect(packet.metrics).toMatchObject({ pass: 3, fail: 1, strict_pass_rate_percent: 75 });
    expect(JSON.stringify(packet)).not.toContain("observation_id");
  });

  it("accepts cited claims whose numbers match the metrics and rejects the rest", () => {
    const result = validateNarrative(output([
      { text: "The assistant answered 3 of 4 tests correctly (75%).", finding_ids: [], assessment_ids: ["a0"] },
      { text: "Rounding failed in 1 of 4 tests; a hypothesis is an ambiguous rule.", finding_ids: ["f-rounding"], assessment_ids: [] },
      { text: "The assistant answered 90% of tests correctly.", finding_ids: [], assessment_ids: ["a0"] },
      { text: "The system is compliant and safe.", finding_ids: ["f-rounding"], assessment_ids: [] },
      { text: "Strong performance overall.", finding_ids: [], assessment_ids: [] },
      { text: "A cited result that does not exist.", finding_ids: [], assessment_ids: ["zzz"] },
    ]), snapshot());
    if (!result.ok) throw new Error(result.reason);
    expect(result.accepted.map((item) => item.text)).toHaveLength(2);
    expect(result.rejected.map((item) => item.reason)).toEqual(["number_not_in_metrics", "prohibited_claim", "no_evidence_cited", "evidence_not_in_snapshot"]);
  });

  it("requires incomplete coverage to lead and rejects prose output", () => {
    expect(validateNarrative({ text: "Great results!", complete: true }, snapshot())).toEqual({ ok: false, reason: "narrative_output_not_json" });
    const incomplete = validateNarrative(output([{ text: "Rounding failed in 1 of 4 tests.", finding_ids: ["f-rounding"], assessment_ids: [] }]), snapshot(true));
    if (!incomplete.ok) throw new Error(incomplete.reason);
    expect(incomplete.accepted).toEqual([]);
    const led = validateNarrative(output([{ text: "Coverage is incomplete: 3 of 4 eligible tests were assessed.", finding_ids: [], assessment_ids: ["a0"] }]), snapshot(true));
    if (!led.ok) throw new Error(led.reason);
    expect(led.accepted).toHaveLength(1);
  });
});
