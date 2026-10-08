import { z } from "zod";
import type { CefCase } from "./cases";

type Reference = CefCase["reference"];
export type Answerability = Reference["answerability"];

/** Grading inputs a person can set when adding or editing a test question. */
export const referenceEditSchema = z.strictObject({
  keyFacts: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
  acceptableAlternatives: z.array(z.string().trim().min(1).max(2000)).max(6).optional(),
  answerability: z.enum(["answerable", "missing_information", "unanswerable", "must_abstain"]).optional(),
});
export type ReferenceEdit = z.infer<typeof referenceEditSchema>;

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

/**
 * The reference of a question a person wrote or rewrote.
 *
 * Key facts, alternatives, prohibited claims and cited excerpts belong to the
 * question they were written for: carrying them onto a new question or answer
 * makes the judge require facts the new question never asked for. They are
 * kept only while both the question and the expected answer are unchanged;
 * otherwise they come from the edit or are cleared, so the judge grades
 * against the expected answer alone. Grader order is preserved because rubric
 * criteria are matched to graders by position.
 */
export function editedReference(original: Reference, expected: Reference["expected"], edit: ReferenceEdit, contentChanged: boolean): Reference {
  const keep = !contentChanged;
  const keyFacts = edit.keyFacts ? unique(edit.keyFacts) : keep ? original.required_claims : [];
  const prohibited = keep ? original.prohibited_claims : [];
  const { derivation_notes: notes, ...rest } = original;
  return {
    ...rest,
    ...(keep && notes !== undefined ? { derivation_notes: notes } : {}),
    expected,
    answerability: edit.answerability ?? (keep ? original.answerability : "answerable"),
    acceptable_alternatives: edit.acceptableAlternatives ? unique(edit.acceptableAlternatives) : keep ? original.acceptable_alternatives : [],
    required_claims: keyFacts,
    prohibited_claims: prohibited,
    source_refs: keep ? original.source_refs : [],
    graders: original.graders.map((grader) => {
      if (grader.kind !== "claims") return grader;
      if (keep && !edit.keyFacts) return grader;
      return { ...grader, required: keyFacts, prohibited };
    }),
  };
}
