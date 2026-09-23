/** Render a clearly synthetic PDF with the exact production document renderer. */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { syntheticAccountingFixture } from "../../lib/evals/generation/packs";
import { aggregateRun } from "../../lib/evals/scoring/aggregate";
import { buildReportSnapshot } from "../../lib/evals/reports/contracts";
import { renderReportPdf } from "../../lib/evals/reports/render";

const fixture = syntheticAccountingFixture();
const caseRevision = fixture.cases[0];
const now = new Date().toISOString();
const targetRevisionId = randomUUID();
const snapshot = buildReportSnapshot({
  schema_version: "1.0",
  report_revision_id: randomUUID(),
  run_id: randomUUID(),
  created_at: now,
  system: {
    name: "Synthetic accounting assistant",
    target_revision_id: targetRevisionId,
    purpose: "Document renderer acceptance with synthetic data only.",
    execution_mode: "imported_responses",
  },
  scope: {
    suite_version_id: randomUUID(),
    evidence_policy: "source_grounded",
    started_at: now,
    finished_at: now,
    languages: ["en"],
    review_status: "preliminary",
  },
  metrics: aggregateRun([{ id: caseRevision.revision_id, familyId: caseRevision.family_id,
    eligible: true, executionStatus: "succeeded", outcome: "pass", severity: "medium" }]),
  findings: [],
  results: [{
    case_revision_id: caseRevision.revision_id,
    title: caseRevision.title,
    topic: "calculation",
    severity: "medium",
    outcome: "pass",
    assessment_id: randomUUID(),
    observation_id: randomUUID(),
    input: caseRevision.scenario.messages[0].content,
    output: '{"total":"135.80","currency":"EUR"}',
    rationale: "The synthetic answer matches the expected calculation.",
    source_refs: [],
    review_status: "unreviewed",
  }],
  improvements: [],
  methodology: {
    cef_version: "1.0",
    scorer_version: "deterministic-v1",
    grader_revisions: ["deterministic-v1"],
    rubric_revisions: [fixture.rubric.revision_id],
    source_revisions: [fixture.source.revision_id],
    sampling: "One synthetic accounting fixture.",
    exclusions: [],
    review_coverage: "Preliminary synthetic demonstration only.",
    cost: null,
    limitations: ["Synthetic fixture; no customer system or data was evaluated."],
  },
});

async function main() {
  const output = process.argv[2];
  if (!output?.startsWith("/output/")) throw new Error("Use an output path below /output");
  const pdf = await renderReportPdf(snapshot, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    return { page, close: () => browser.close() };
  });
  writeFileSync(output, Buffer.from(pdf));
  console.info(JSON.stringify({ synthetic: true, bytes: pdf.length, reportHash: snapshot.content_hash }));
}
main().catch(() => { console.error("synthetic_pdf_render_failed"); process.exitCode = 1; });
