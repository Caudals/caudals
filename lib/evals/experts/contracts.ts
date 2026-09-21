import { z } from "zod";
import {
  hashSchema,
  jsonValueSchema,
  languageSchema,
  schemaVersionSchema,
  timestampSchema,
} from "../contracts/primitives";

export const expertAssignmentKinds = [
  "authoring",
  "independent_review",
  "adjudication",
  "calibration",
] as const;

export const expertAssignmentKindSchema = z.enum(expertAssignmentKinds);
export const conflictDeclarationSchema = z.enum(["clear", "disclosed"]);
export const expertSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const expertProfileInputSchema = z.strictObject({
  userId: z.string().min(1).max(200),
  domains: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
  jurisdictions: z.array(z.string().trim().min(1).max(120)).max(30),
  languages: z.array(languageSchema).min(1).max(20),
  credentialsStatus: z.enum(["pending", "verified", "rejected"]),
  termsStatus: z.enum(["pending", "accepted", "expired"]),
  eligibilityStatus: z.enum(["inactive", "calibrating", "eligible", "suspended"]),
});

export const expertGuidelineSchema = z.strictObject({
  schema_version: schemaVersionSchema,
  revision_id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(30_000),
  criteria: z.array(z.strictObject({
    id: z.string().min(1).max(120),
    description: z.string().trim().min(1).max(4_000),
    required: z.boolean(),
  })).min(1).max(100),
  created_at: timestampSchema,
  content_hash: hashSchema,
});

export const redactedEvidenceSchema = z.strictObject({
  excerpts: z.array(z.strictObject({
    anchor: z.string().trim().min(1).max(500),
    text: z.string().trim().min(1).max(20_000),
    source_revision_id: z.uuid().optional(),
  })).max(100),
  transcript: z.array(z.strictObject({
    role: z.enum(["user", "assistant", "tool"]),
    content: z.string().max(50_000),
    turn: z.int().nonnegative().max(10_000).optional(),
  })).max(500),
}).superRefine((value, context) => {
  if (value.excerpts.length === 0 && value.transcript.length === 0) {
    context.addIssue({ code: "custom", message: "An assignment requires redacted evidence" });
  }
  if (JSON.stringify(value).length > 250_000) {
    context.addIssue({ code: "custom", message: "Redacted evidence exceeds the assignment limit" });
  }
});

export const expertAssignmentInputSchema = z.strictObject({
  kind: expertAssignmentKindSchema,
  expertProfileId: z.uuid(),
  guidelineRevisionId: z.uuid(),
  severity: expertSeveritySchema,
  evidenceSnapshot: redactedEvidenceSchema,
  conflictDeclaration: conflictDeclarationSchema,
  dueAt: timestampSchema.nullable(),
  reviewOfSubmissionRevisionId: z.uuid().nullable(),
}).superRefine((value, context) => {
  const reviewsExisting = value.kind === "independent_review" || value.kind === "adjudication";
  if (reviewsExisting && !value.reviewOfSubmissionRevisionId) {
    context.addIssue({ code: "custom", path: ["reviewOfSubmissionRevisionId"], message: "Review work requires a submitted revision" });
  }
  if (!reviewsExisting && value.reviewOfSubmissionRevisionId) {
    context.addIssue({ code: "custom", path: ["reviewOfSubmissionRevisionId"], message: "Authoring and calibration work cannot review a submission" });
  }
});

export const expertSubmissionDocumentSchema = z.strictObject({
  answer: jsonValueSchema,
  rationale: z.string().trim().min(1).max(12_000),
  source_refs: z.array(z.strictObject({
    source_revision_id: z.uuid(),
    anchor: z.string().trim().min(1).max(500),
  })).max(100),
  flags: z.array(z.enum(["ambiguous", "missing_source", "guideline_question"])).max(20),
});

export const qualityDecisionSchema = z.strictObject({
  decision: z.enum(["approve", "changes_requested", "reject"]),
  authorProfileId: z.uuid(),
  reviewerProfileId: z.uuid(),
  submissionRevisionId: z.uuid(),
  severity: expertSeveritySchema,
  rationale: z.string().trim().min(1).max(12_000),
}).superRefine((value, context) => {
  if (value.authorProfileId === value.reviewerProfileId) {
    context.addIssue({ code: "custom", path: ["reviewerProfileId"], message: "Independent review requires a different reviewer" });
  }
});

type ProjectionInput = {
  id: string;
  kind: string;
  status: string;
  evidence_snapshot: unknown;
  guideline: { title?: unknown; instructions?: unknown };
  due_at: unknown;
  own_revision: { version?: unknown; status?: unknown; document?: unknown } | null;
  review_phase: string;
  peer_decisions?: Array<{ decision?: unknown; rationale?: unknown; [key: string]: unknown }>;
  [key: string]: unknown;
};

export type RedactedAssignmentProjection = {
  id: string;
  kind: string;
  status: string;
  evidence: z.infer<typeof redactedEvidenceSchema>;
  guideline: { title: string; instructions: string };
  dueAt: string | null;
  ownRevision: { version: number; status: string; document: z.infer<typeof jsonValueSchema> } | null;
  peerDecisions?: Array<{ decision: string; rationale: string }>;
};

export function redactedAssignmentProjection(input: ProjectionInput): RedactedAssignmentProjection {
  const result: RedactedAssignmentProjection = {
    id: z.uuid().parse(input.id),
    kind: expertAssignmentKindSchema.parse(input.kind),
    status: z.string().min(1).max(80).parse(input.status),
    evidence: redactedEvidenceSchema.parse(input.evidence_snapshot),
    guideline: {
      title: z.string().min(1).max(200).parse(input.guideline.title),
      instructions: z.string().min(1).max(30_000).parse(input.guideline.instructions),
    },
    dueAt: input.due_at === null ? null : timestampSchema.parse(input.due_at),
    ownRevision: input.own_revision === null ? null : {
      version: z.int().positive().parse(input.own_revision.version),
      status: z.string().min(1).max(80).parse(input.own_revision.status),
      document: jsonValueSchema.parse(input.own_revision.document),
    },
  };

  if (input.review_phase === "revealed") {
    result.peerDecisions = (input.peer_decisions ?? []).map((decision) => ({
      decision: z.enum(["approve", "changes_requested", "reject"]).parse(decision.decision),
      rationale: z.string().min(1).max(12_000).parse(decision.rationale),
    }));
  }
  return result;
}

export type ExpertProfileInput = z.infer<typeof expertProfileInputSchema>;
export type ExpertAssignmentInput = z.infer<typeof expertAssignmentInputSchema>;
export type ExpertSubmissionDocument = z.infer<typeof expertSubmissionDocumentSchema>;
export type QualityDecision = z.infer<typeof qualityDecisionSchema>;
