/**
 * "What we understood about your assistant" (launch L-34, P-56): the context
 * profile in plain words, the corrections a person makes on one screen, and
 * the confirmed profile revision generation then uses. Pure functions; the
 * repository (lib/evals/repositories/intake.ts) stores and audits them.
 */
import { z } from "zod";
import { contextProfileSchema, type ContextProfile } from "../generation/context";
import { parseAsOfAnswer, parseLanguageAnswer } from "../generation/auto-draft";
import { withContentHash } from "../contracts/hashing";

export { CONFIRMATION_REASON, CONFIRMATION_WAIT_MINUTES, LOW_CONFIDENCE } from "./constants";
import { LOW_CONFIDENCE } from "./constants";
/** The case extension that ties every generated test to its context profile revision. */
export const CONTEXT_EXTENSION = "caudals.evals/context-profile";
/** The report methodology line when the person skipped the screen or it timed out. */
export const CONTEXT_NOT_CONFIRMED = "Context not confirmed by the customer.";

/** The fields a person sees and may correct, by their profile names. */
export const CONTEXT_FIELDS = ["purpose", "intended_users", "tasks", "languages", "jurisdiction", "as_of", "business_boundaries", "source_hierarchy"] as const;
export type ContextField = typeof CONTEXT_FIELDS[number];

const item = z.string().trim().min(1).max(500);
export const contextEditsSchema = z.strictObject({
  purpose: z.string().trim().min(1).max(2000).optional(),
  intendedUsers: z.array(item).max(50).optional(),
  tasks: z.array(item).max(100).optional(),
  languages: z.array(z.string().trim().min(2).max(35)).min(1).max(20).optional(),
  /** null clears it (no particular jurisdiction). */
  jurisdiction: z.string().trim().max(200).nullable().optional(),
  /** YYYY-MM-DD; null means "today's sources, no fixed date". */
  asOf: z.string().trim().max(40).nullable().optional(),
  boundaries: z.array(item).max(50).optional(),
  /** The source that wins when sources disagree. */
  primarySourceRevisionId: z.uuid().optional(),
});
export type ContextEdits = z.infer<typeof contextEditsSchema>;

/** Where each inferred field came from, and what the model inferred beyond the stored profile. */
export type ContextEvidence = { basis: Record<string, string[]>; inferred: { boundaries?: string[] } };
export const contextEvidenceSchema = z.object({
  basis: z.record(z.string(), z.array(z.string().max(200)).max(20)).default({}),
  inferred: z.object({ boundaries: z.array(z.string().max(500)).max(50).optional() }).default({}),
}).catch({ basis: {}, inferred: {} });

const PROFILE_TO_EVIDENCE: Record<string, string> = {
  purpose: "purpose", intended_users: "intendedUsers", tasks: "tasks", languages: "languages", jurisdiction: "jurisdiction",
  as_of: "asOf", business_boundaries: "businessBoundaries",
};

const sameList = (a: readonly string[], b: readonly string[]) => JSON.stringify(a.map((value) => value.trim())) === JSON.stringify(b.map((value) => value.trim()));
const day = (value: string | null) => (value ? value.slice(0, 10) : null);

/** What the screen shows for a field: confidence, highlight and evidence keys. */
export function fieldConfidence(profile: ContextProfile, field: ContextField): number {
  if (field === "purpose") return profile.purpose.value ? profile.purpose.confidence : 0;
  if (field === "jurisdiction") return profile.jurisdiction.value ? profile.jurisdiction.confidence : 0;
  if (field === "source_hierarchy") return 1;
  const key = PROFILE_TO_EVIDENCE[field];
  const value = profile.field_confidence[key] ?? profile.field_confidence[field];
  if (typeof value === "number") return value;
  if (field === "as_of") return profile.as_of ? 1 : 0;
  return 0;
}

export function evidenceKeys(evidence: ContextEvidence, profile: ContextProfile, field: ContextField): string[] {
  const own = field === "purpose" ? profile.purpose.basis : field === "jurisdiction" ? profile.jurisdiction.basis : [];
  const inferred = evidence.basis[PROFILE_TO_EVIDENCE[field] ?? field] ?? [];
  return [...new Set([...own, ...inferred])];
}

/** The boundaries ("what it must not do") as shown: stored, else what the analyst inferred. */
export function shownBoundaries(profile: ContextProfile, evidence: ContextEvidence): string[] {
  return profile.business_boundaries.length ? profile.business_boundaries : evidence.inferred.boundaries ?? [];
}

/**
 * The confirmed profile: the base revision with the person's corrections.
 * Every corrected field carries the confirmation as its basis and full
 * confidence; questions about corrected fields are resolved. The revision
 * always records the confirmation, so a confirmation without corrections is
 * still a new, attributable revision.
 */
export function applyContextEdits(base: ContextProfile, edits: ContextEdits, input: { confirmationId: string; evidence: ContextEvidence }): { profile: ContextProfile; editedFields: ContextField[] } {
  const profile = contextProfileSchema.parse(base);
  const basis = [`customer_confirmation:${input.confirmationId}`];
  const edited: ContextField[] = [];
  const confidence = { ...profile.field_confidence };
  let next: ContextProfile = { ...profile, confirmed_context: [...profile.confirmed_context] };
  if (edits.purpose !== undefined && edits.purpose !== (profile.purpose.value ?? "")) {
    next.purpose = { value: edits.purpose, confidence: 1, basis };
    confidence.purpose = 1; edited.push("purpose");
  }
  if (edits.intendedUsers && !sameList(edits.intendedUsers, profile.intended_users)) {
    next.intended_users = edits.intendedUsers; confidence.intendedUsers = 1; edited.push("intended_users");
  }
  if (edits.tasks && !sameList(edits.tasks, profile.tasks)) {
    next.tasks = edits.tasks; confidence.tasks = 1; edited.push("tasks");
  }
  if (edits.languages) {
    const languages = [...new Set(parseLanguageAnswer(edits.languages.join(", ")))];
    if (!sameList(languages, profile.languages)) { next.languages = languages; confidence.languages = 1; edited.push("languages"); }
  }
  if (edits.jurisdiction !== undefined) {
    const value = edits.jurisdiction ? edits.jurisdiction : null;
    if (value !== profile.jurisdiction.value) { next.jurisdiction = { value, confidence: 1, basis }; confidence.jurisdiction = 1; edited.push("jurisdiction"); }
  }
  if (edits.asOf !== undefined) {
    const value = edits.asOf ? parseAsOfAnswer(edits.asOf) : null;
    if (day(value) !== day(profile.as_of)) { next.as_of = value; confidence.asOf = 1; edited.push("as_of"); }
  }
  const boundaries = shownBoundaries(profile, input.evidence);
  if (edits.boundaries && !sameList(edits.boundaries, boundaries)) {
    next.business_boundaries = edits.boundaries; confidence.businessBoundaries = 1; edited.push("business_boundaries");
  } else if (!profile.business_boundaries.length && boundaries.length) {
    // Confirmed as shown: the inferred boundaries become part of the profile.
    next.business_boundaries = boundaries;
  }
  if (edits.primarySourceRevisionId) {
    const index = profile.source_hierarchy.findIndex((entry) => entry.source_revision_id === edits.primarySourceRevisionId);
    if (index < 0) throw new Error("context_source_unknown");
    if (index > 0) {
      const ordered = [profile.source_hierarchy[index], ...profile.source_hierarchy.filter((_, position) => position !== index)];
      next.source_hierarchy = ordered.map((entry, position) => ({ ...entry, rank: position + 1, authority: position === 0 ? "customer_designated_primary" : entry.authority }));
      edited.push("source_hierarchy");
    }
  }
  const resolved = new Set<string>(edited);
  next = {
    ...next,
    field_confidence: confidence,
    unanswered_questions: next.unanswered_questions.filter((question) => !resolved.has(question.field)),
    confirmed_context: [...next.confirmed_context, {
      confirmation_id: input.confirmationId, field: "context_profile",
      question: "What we understood about your assistant",
      answer: edited.length ? `Confirmed with corrections: ${edited.join(", ")}` : "Confirmed without changes",
    }],
  };
  return { profile: contextProfileSchema.parse(withContentHash(Object.fromEntries(Object.entries(next).filter(([key]) => key !== "content_hash")))), editedFields: edited };
}

/** The case extension recorded on every generated test (traceability, launch L-34). */
export function contextExtension(input: { profileRevisionId: string; confirmationId: string | null; status: "confirmed" | "skipped" | "not_requested"; skipReason?: string | null }) {
  return {
    profile_revision_id: input.profileRevisionId,
    confirmation_id: input.confirmationId,
    confirmed: input.status === "confirmed",
    status: input.status,
    ...(input.skipReason ? { skip_reason: input.skipReason } : {}),
  };
}

/** Whether any of these test documents was written from a context the customer did not confirm. */
export function contextNotConfirmed(caseDocuments: Array<{ extensions?: Record<string, unknown> } | null | undefined>): boolean {
  return caseDocuments.some((document) => {
    const value = document?.extensions?.[CONTEXT_EXTENSION] as { confirmed?: unknown; status?: unknown } | undefined;
    return !!value && value.status === "skipped";
  });
}
