import { describe, expect, it } from "vitest";
import {
  expertAssignmentInputSchema,
  expertProfileInputSchema,
  qualityDecisionSchema,
  redactedAssignmentProjection,
} from "../../lib/evals/experts/contracts";
import { computeExpertQualityMetrics } from "../../lib/evals/experts/quality";

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
    });
    expect(projected).not.toHaveProperty("peerDecisions");
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_MODEL|PRIVATE_AUTHOR|PRIVATE_PAYMENT|PRIVATE_WORKSPACE|PRIVATE_PEER/);
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
