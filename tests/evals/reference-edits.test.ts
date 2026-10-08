import { describe, expect, it } from "vitest";
import { editedReference, referenceEditSchema } from "../../lib/evals/contracts/reference-edits";
import type { CefCase } from "../../lib/evals/contracts/cases";

const rubric = "11111111-1111-4111-8111-111111111111";
const judge = { kind: "llm_judge" as const, model_revision_id: rubric, prompt_revision_id: rubric, calibration_revision_id: null };
const original: CefCase["reference"] = {
  answerability: "answerable",
  expected: "La inversión mínima inicial es de 1000 €.",
  acceptable_alternatives: ["1.000 euros"],
  required_claims: ["inversión mínima inicial de 1000 €"],
  prohibited_claims: ["sin mínimo"],
  prohibited_actions: [],
  source_refs: [{ source_revision_id: rubric, anchor: "a1" }],
  rubric_revision_id: rubric,
  graders: [{ kind: "claims", required: ["inversión mínima inicial de 1000 €"], prohibited: ["sin mínimo"] }, judge],
  derivation_notes: "generated from the minimum-investment page",
};

describe("editedReference", () => {
  it("does not carry the previous question's key facts onto a new question", () => {
    const reference = editedReference(original, "Por traspaso no se tributa.", {}, true);
    expect(reference.required_claims).toEqual([]);
    expect(reference.graders[0]).toEqual({ kind: "claims", required: [], prohibited: [] });
    expect(reference.prohibited_claims).toEqual([]);
    expect(reference.acceptable_alternatives).toEqual([]);
    expect(reference.source_refs).toEqual([]);
    expect(reference.answerability).toBe("answerable");
    expect(reference).not.toHaveProperty("derivation_notes");
    expect(reference.expected).toBe("Por traspaso no se tributa.");
  });

  it("uses the key facts, alternatives and behaviour a person sets, de-duplicated", () => {
    const reference = editedReference(original, "No debe recomendar un perfil.", {
      keyFacts: [" no recomienda un perfil ", "remite al test de perfil", "no recomienda un perfil"],
      acceptableAlternatives: ["Pide hacer el test"],
      answerability: "must_abstain",
    }, true);
    expect(reference.required_claims).toEqual(["no recomienda un perfil", "remite al test de perfil"]);
    expect(reference.graders[0]).toMatchObject({ kind: "claims", required: ["no recomienda un perfil", "remite al test de perfil"] });
    expect(reference.acceptable_alternatives).toEqual(["Pide hacer el test"]);
    expect(reference.answerability).toBe("must_abstain");
  });

  it("keeps everything for a title-only edit and preserves grader order", () => {
    const reference = editedReference(original, original.expected, {}, false);
    expect(reference).toEqual(original);
    expect(reference.graders.map((grader) => grader.kind)).toEqual(["claims", "llm_judge"]);
  });

  it("lets a person change only the key facts of an unchanged question", () => {
    const reference = editedReference(original, original.expected, { keyFacts: ["1.000 €"] }, false);
    expect(reference.required_claims).toEqual(["1.000 €"]);
    expect(reference.graders[0]).toEqual({ kind: "claims", required: ["1.000 €"], prohibited: ["sin mínimo"] });
    expect(reference.source_refs).toEqual(original.source_refs);
  });

  it("bounds what the API accepts", () => {
    expect(referenceEditSchema.safeParse({ keyFacts: Array(13).fill("x") }).success).toBe(false);
    expect(referenceEditSchema.safeParse({ answerability: "maybe" }).success).toBe(false);
    expect(referenceEditSchema.safeParse({ keyFacts: ["a"], answerability: "missing_information" }).success).toBe(true);
  });
});
