import { describe, expect, it } from "vitest";
import {
  expertAssignmentInputSchema,
  expertProfileInputSchema,
  qualityDecisionSchema,
  redactedAssignmentProjection,
} from "../../lib/evals/experts/contracts";
import { computeExpertQualityMetrics } from "../../lib/evals/experts/quality";
import { buildExpertExcerpts, orderEvidence } from "../../lib/evals/experts/redaction";
import { reportFixtures } from "../../scripts/evals/report-fixtures";

const assignmentId = "00000000-0000-4000-8000-000000000101";
const profileId = "00000000-0000-4000-8000-000000000102";
const guidelineId = "00000000-0000-4000-8000-000000000103";
const submissionId = "00000000-0000-4000-8000-000000000104";

describe("WP-14 expert contracts", () => {
  it("projects only assigned redacted evidence and hides identities while review is blind", () => {
    const projected = redactedAssignmentProjection({
      id: assignmentId,
      kind: "independent_review",
      status: "in_progress",
      evidence_snapshot: {
        excerpts: [{ anchor: "p1", text: "Redacted policy" }],
        transcript: [{ role: "assistant", content: "Redacted answer" }],
      },
      guideline: { title: "Review guideline", instructions: "Check the supplied evidence." },
      due_at: "2026-09-30T12:00:00.000Z",
      own_revision: { version: 2, status: "draft", document: { answer: "Needs work" } },
      review_target: {
        answer: "Submission being reviewed", rationale: "Grounded rationale",
        source_refs: [{ source_revision_id: guidelineId, anchor: "p1" }], flags: [],
      },
      model_identity: "PRIVATE_MODEL_SENTINEL",
      author_identity: "PRIVATE_AUTHOR_SENTINEL",
      payment_amount: "PRIVATE_PAYMENT_SENTINEL",
      workspace_id: "PRIVATE_WORKSPACE_SENTINEL",
      peer_decisions: [{ reviewer_profile_id: profileId, decision: "approve", rationale: "PRIVATE_PEER_SENTINEL" }],
      review_phase: "blind",
    });

    expect(projected).toMatchObject({
      id: assignmentId,
      evidence: { excerpts: [{ anchor: "p1", text: "Redacted policy" }] },
      ownRevision: { version: 2, status: "draft" },
      reviewTarget: { answer: "Submission being reviewed", rationale: "Grounded rationale", sourceAnchors: ["p1"], flags: [] },
    });
    expect(projected).not.toHaveProperty("peerDecisions");
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_MODEL|PRIVATE_AUTHOR|PRIVATE_PAYMENT|PRIVATE_WORKSPACE|PRIVATE_PEER/);
    expect(JSON.stringify(projected.reviewTarget)).not.toContain(guidelineId);
  });

  it("reveals only anonymized peer decisions after the configured phase ends", () => {
    const projected = redactedAssignmentProjection({
      id: assignmentId,
      kind: "adjudication",
      status: "in_review",
      evidence_snapshot: { excerpts: [{ anchor: "p1", text: "Redacted policy" }], transcript: [] },
      guideline: { title: "Adjudication", instructions: "Resolve the disagreement." },
      due_at: null,
      own_revision: null,
      peer_decisions: [{ reviewer_profile_id: profileId, decision: "reject", rationale: "Evidence is insufficient." }],
      review_phase: "revealed",
    });

    expect(projected.peerDecisions).toEqual([{ decision: "reject", rationale: "Evidence is insufficient." }]);
    expect(JSON.stringify(projected.peerDecisions)).not.toContain(profileId);
  });

  it("requires bounded redacted evidence and a conflict declaration", () => {
    const result = expertAssignmentInputSchema.safeParse({
      kind: "authoring",
      expertProfileId: profileId,
      guidelineRevisionId: guidelineId,
      severity: "medium",
      evidenceSnapshot: { excerpts: [], transcript: [] },
      conflictDeclaration: "clear",
      dueAt: null,
      reviewOfSubmissionRevisionId: null,
    });
    expect(result.success).toBe(false);
  });

  it("validates expert eligibility metadata and BCP 47 languages", () => {
    const base = {
      userId: "expert-user",
      domains: ["insurance"],
      jurisdictions: ["ES"],
      languages: ["es-ES", "en"],
      credentialsStatus: "verified",
      termsStatus: "accepted",
      eligibilityStatus: "eligible",
    } as const;
    expect(expertProfileInputSchema.parse(base)).toEqual(base);
    expect(expertProfileInputSchema.safeParse({ ...base, languages: ["not_a_language"] }).success).toBe(false);
  });

  it("does not rank a small calibration sample", () => {
    expect(computeExpertQualityMetrics([{ gold: true, correct: true, agreed: true }])).toEqual({
      count: 1,
      goldCount: 1,
      agreementCount: 1,
      reliable: false,
      score: null,
      agreementRate: null,
    });
  });

  it("reports calibrated quality only once the minimum sample exists", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      gold: true,
      correct: index < 9,
      agreed: index < 8,
    }));
    expect(computeExpertQualityMetrics(rows)).toEqual({
      count: 10,
      goldCount: 10,
      agreementCount: 8,
      reliable: true,
      score: 0.9,
      agreementRate: 0.8,
    });
  });

  it("requires an independent reviewer for every quality approval", () => {
    expect(() => qualityDecisionSchema.parse({
      decision: "approve",
      authorProfileId: profileId,
      reviewerProfileId: profileId,
      submissionRevisionId: submissionId,
      severity: "critical",
      rationale: "The item is correct.",
    })).toThrow(/independent/i);
  });
});

describe("L-26 order assignments through the WP-14 projection", () => {
  it("an expert sees the order's redacted excerpts and guideline, and nothing of the report, order or customer", () => {
    const report = reportFixtures()[1].report;
    const ids = report.results.slice(0, 3).map((item) => item.assessment_id);
    const evidence = orderEvidence(buildExpertExcerpts(report, ids, { locale: "es", names: [report.system.name] }));
    const projected = redactedAssignmentProjection({
      id: assignmentId, kind: "authoring", status: "assigned", evidence_snapshot: evidence,
      guideline: { title: "Revisión experta: las respuestas incorrectas", instructions: "Trabaja solo con este material." },
      due_at: "2026-10-20T16:00:00.000Z", own_revision: null, review_phase: "blind",
      order_id: "PRIVATE_ORDER_SENTINEL", quote_note: "PRIVATE_QUOTE_SENTINEL", workspace: "PRIVATE_CUSTOMER_SENTINEL",
    });
    expect(Object.keys(projected).sort()).toEqual(["dueAt", "evidence", "guideline", "id", "kind", "ownRevision", "status"]);
    const text = JSON.stringify(projected);
    for (const hidden of ["PRIVATE_ORDER_SENTINEL", "PRIVATE_QUOTE_SENTINEL", "PRIVATE_CUSTOMER_SENTINEL", report.run_id, report.report_revision_id, ...ids]) expect(text).not.toContain(hidden);
    expect(projected.evidence.excerpts.map((item) => item.anchor.split(" ")[0])).toEqual(["Q1", "Q2", "Q3"]);
  });
});
