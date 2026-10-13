import { describe, expect, it } from "vitest";
import { buildContextProfile } from "../../lib/evals/generation/context";
import { applyContextEdits, CONTEXT_EXTENSION, contextExtension, contextNotConfirmed, fieldConfidence, shownBoundaries } from "../../lib/evals/intake/context";
import { verifyContentHash } from "../../lib/evals/contracts/hashing";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CONFIRMATION = "33333333-3333-4333-8333-333333333333";

function inferred() {
  return buildContextProfile({
    evaluationId: "evaluation-1", purpose: "Answer questions about home insurance", intendedUsers: ["Policy holders"], tasks: ["Explain coverage", "Explain claims"],
    languages: ["es"], jurisdiction: undefined, asOf: null, sources: [{ revisionId: A }, { revisionId: B }],
    fieldConfidence: { purpose: 0.9, intendedUsers: 0.4, tasks: 0.8, languages: 0.6 }, fieldBasis: { purpose: [`${A}:anchor-1`] }, promptRevision: "auto-v1",
  });
}

/** Launch L-34: "What we understood about your assistant". */
describe("context confirmation", () => {
  it("records corrections as a new, hashed revision with the confirmation as basis", () => {
    const base = inferred();
    const { profile, editedFields } = applyContextEdits(base, {
      purpose: "Answer policy holders about home insurance coverage", intendedUsers: ["Policy holders", "Brokers"], tasks: ["Explain coverage", "Explain claims"],
      languages: ["Spanish", "en"], jurisdiction: "Spain", asOf: "2026-10-01", boundaries: ["Never promise a claim will be paid"], primarySourceRevisionId: B,
    }, { confirmationId: CONFIRMATION, evidence: { basis: {}, inferred: {} } });
    expect(editedFields).toEqual(["purpose", "intended_users", "languages", "jurisdiction", "as_of", "business_boundaries", "source_hierarchy"]);
    expect(profile.purpose).toEqual({ value: "Answer policy holders about home insurance coverage", confidence: 1, basis: [`customer_confirmation:${CONFIRMATION}`] });
    expect(profile.languages).toEqual(["es", "en"]);
    expect(profile.as_of).toBe("2026-10-01T00:00:00.000Z");
    expect(profile.source_hierarchy.map((entry) => [entry.source_revision_id, entry.rank])).toEqual([[B, 1], [A, 2]]);
    expect(profile.source_hierarchy[0].authority).toBe("customer_designated_primary");
    expect(profile.confirmed_context.at(-1)).toMatchObject({ confirmation_id: CONFIRMATION, field: "context_profile" });
    expect(profile.content_hash).not.toBe(base.content_hash);
    verifyContentHash(profile);
    // The unchanged task list is not an edit.
    expect(editedFields).not.toContain("tasks");
  });

  it("confirming without changes is still a distinct revision, and keeps the inferred boundaries", () => {
    const base = inferred();
    const { profile, editedFields } = applyContextEdits(base, {}, { confirmationId: CONFIRMATION, evidence: { basis: {}, inferred: { boundaries: ["No legal advice"] } } });
    expect(editedFields).toEqual([]);
    expect(profile.content_hash).not.toBe(base.content_hash);
    expect(profile.business_boundaries).toEqual(["No legal advice"]);
    expect(profile.confirmed_context.at(-1)?.answer).toBe("Confirmed without changes");
    expect(shownBoundaries(base, { basis: {}, inferred: { boundaries: ["No legal advice"] } })).toEqual(["No legal advice"]);
  });

  it("refuses an unknown source or an invalid date or language", () => {
    const base = inferred();
    const evidence = { basis: {}, inferred: {} };
    expect(() => applyContextEdits(base, { primarySourceRevisionId: CONFIRMATION }, { confirmationId: CONFIRMATION, evidence })).toThrow("context_source_unknown");
    expect(() => applyContextEdits(base, { asOf: "2026-02-31" }, { confirmationId: CONFIRMATION, evidence })).toThrow();
    expect(() => applyContextEdits(base, { languages: ["Klingon"] }, { confirmationId: CONFIRMATION, evidence })).toThrow();
  });

  it("flags low-confidence fields for the screen", () => {
    const base = inferred();
    expect(fieldConfidence(base, "purpose")).toBe(0.9);
    expect(fieldConfidence(base, "intended_users")).toBe(0.4);
    expect(fieldConfidence(base, "jurisdiction")).toBe(0);
  });

  it("marks tests from a skipped context so the report can say so", () => {
    const skipped = { extensions: { [CONTEXT_EXTENSION]: contextExtension({ profileRevisionId: A, confirmationId: CONFIRMATION, status: "skipped", skipReason: "timeout" }) } };
    const confirmed = { extensions: { [CONTEXT_EXTENSION]: contextExtension({ profileRevisionId: B, confirmationId: CONFIRMATION, status: "confirmed" }) } };
    expect(contextNotConfirmed([confirmed, { extensions: {} }, null])).toBe(false);
    expect(contextNotConfirmed([confirmed, skipped])).toBe(true);
    expect(skipped.extensions[CONTEXT_EXTENSION]).toEqual({ profile_revision_id: A, confirmation_id: CONFIRMATION, confirmed: false, status: "skipped", skip_reason: "timeout" });
  });
});
