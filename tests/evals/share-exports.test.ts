import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { buildReportSnapshot } from "../../lib/evals/reports/contracts";
import { aggregateRun } from "../../lib/evals/scoring/aggregate";
import { renderReportDocx } from "../../lib/evals/reports/docx";
import { renderReportHtml, renderResultsCsv } from "../../lib/evals/reports/render";
import { redactSharedSnapshot } from "../../lib/evals/reports/share-redaction";
import { shareExportKinds } from "../../lib/evals/reports/share-sections";

const DEFAULT_SHARE = ["system", "scope", "metrics", "takeaways", "findings", "improvements", "methodology"];

function snapshot(incomplete = false) {
  const now = new Date().toISOString();
  const results = [0, 1].map((index) => ({
    case_revision_id: randomUUID(), title: `Case ${index}`, topic: "fees", severity: "high" as const,
    outcome: index ? "fail" as const : "pass" as const, assessment_id: `a${index}`, observation_id: randomUUID(),
    input: `Private question ${index}`, output: `Private answer ${index}`, rationale: "Compared with the policy.", source_refs: [], review_status: "unreviewed",
  }));
  const metrics = aggregateRun(results.map((result, index) => ({ id: result.case_revision_id, familyId: `f${index}`, eligible: true, executionStatus: "succeeded", outcome: result.outcome, severity: "high" })));
  return buildReportSnapshot({
    schema_version: "1.0", report_revision_id: randomUUID(), run_id: randomUUID(), created_at: now,
    system: { name: "Confidential assistant", target_revision_id: randomUUID(), purpose: "Internal purpose", execution_mode: "deployed_system" },
    scope: { suite_version_id: "suite-secret", evidence_policy: "source_grounded", started_at: now, finished_at: now, languages: ["en"], review_status: "preliminary" },
    metrics: incomplete ? { ...metrics, headline_status: "incomplete" } : metrics,
    findings: [{ id: "f1", title: "Fee answers missing", severity: "high", evidence_strength: "observed", frequency_n: 1, frequency_denominator: 2,
      observation: "One fee answer was missing.", cause_hypothesis: null, recommendation: "Add the fee table.", assessment_ids: ["a1"] }],
    results, improvements: [{ id: "i1", priority: 1, title: "Publish fee table", owner: null, status: "proposed", finding_ids: ["f1"], validation_plan: "Re-run" }],
    methodology: { cef_version: "1.0", scorer_version: "scorer-secret", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "all", exclusions: [], review_coverage: "none", cost: null, limitations: ["Two tests timed out."] },
  });
}

describe("shared report downloads", () => {
  it("offers per-test files only when results are shared", () => {
    expect(shareExportKinds(DEFAULT_SHARE)).toEqual(["pdf", "docx"]);
    expect(shareExportKinds([...DEFAULT_SHARE, "results"])).toEqual(["pdf", "docx", "csv", "cef"]);
  });

  it("replaces unshared sections with placeholders and drops references into them", () => {
    const { report, hidden } = redactSharedSnapshot(snapshot(), ["metrics", "takeaways", "findings"]);
    expect([...hidden].sort()).toEqual(["improvements", "methodology", "results", "scope", "system"]);
    expect(report.results).toEqual([]);
    expect(report.improvements).toEqual([]);
    expect(report.system.name).toBe("");
    expect(report.methodology.scorer_version).toBe("");
    expect(report.findings[0].assessment_ids).toEqual([]);
    expect(report.takeaways.every((item) => item.assessment_ids.length === 0)).toBe(true);
  });

  it("keeps the limitations of an incomplete headline even without methodology", () => {
    const { report } = redactSharedSnapshot(snapshot(true), ["metrics"]);
    expect(report.methodology.limitations).toEqual(["Two tests timed out."]);
  });

  it("renders the PDF document without unshared sections", () => {
    const { report, hidden } = redactSharedSnapshot(snapshot(), DEFAULT_SHARE);
    const html = renderReportHtml(report, "en", hidden);
    expect(html).toContain("Confidential assistant");
    expect(html).toContain("Fee answers missing");
    expect(html).not.toContain("Private question");
    expect(html).not.toContain("Interaction evidence");
    expect(html).toContain("Shared copy");

    const anonymous = redactSharedSnapshot(snapshot(), ["findings"]);
    const minimal = renderReportHtml(anonymous.report, "es", anonymous.hidden);
    expect(minimal).not.toContain("Confidential assistant");
    expect(minimal).not.toContain("suite-secret");
    expect(minimal).not.toContain("scorer-secret");
    expect(minimal).toContain("Copia compartida");
  });

  it("renders the Word document without unshared sections", async () => {
    const { report, hidden } = redactSharedSnapshot(snapshot(), ["findings", "takeaways"]);
    const xml = await (await JSZip.loadAsync(await renderReportDocx(report, "en", hidden))).file("word/document.xml")!.async("string");
    expect(xml).toContain("Fee answers missing");
    expect(xml).not.toContain("Confidential assistant");
    expect(xml).not.toContain("Private question");
    expect(xml).not.toContain("Publish fee table");
    expect(xml).not.toContain("scorer-secret");
  });

  it("exports results as CSV when they are shared", () => {
    const { report } = redactSharedSnapshot(snapshot(), [...DEFAULT_SHARE, "results"]);
    expect(renderResultsCsv(report)).toContain("Private question 1");
  });
});
