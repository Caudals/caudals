// Versioned domain packs available to the generation workflow (spec §9.4).
// Pack selection is internal; customers see a plain-language scope summary.
// The registry describes what each pack supplies; the executable pack lives in
// ./packs.ts and is referenced by the same id and version.

export type DomainPack = {
  id: string;
  version: string;
  title: string;
  status: "active" | "fixture";
  summary: string;
  taskTypes: string[];
  requiredContext: string[];
  sourceHierarchy: string[];
  rubricCriteria: Array<{ id: string; description: string }>;
  deterministicEvaluators: string[];
  prohibitedAssumptions: string[];
  reviewGuidelines: string;
};

export const DOMAIN_PACKS: DomainPack[] = [
  {
    id: "generic-grounded-qa",
    version: "1",
    title: "Generic grounded Q&A",
    status: "active",
    summary: "Questions answerable from supplied reference material, each linked to an exact source excerpt.",
    taskTypes: ["grounded_qa"],
    requiredContext: ["purpose", "language", "source authority order", "as-of date when claims are date-sensitive"],
    sourceHierarchy: ["customer policy for product-specific promises", "dated authoritative sources for external claims", "chatbot self-descriptions are hints, never evidence"],
    rubricCriteria: [
      { id: "correctness", description: "The answer states the source-supported result without contradiction." },
      { id: "grounding", description: "Material claims remain within the supplied evidence." },
    ],
    deterministicEvaluators: ["claims (required and prohibited phrases)", "exact_match", "json_schema"],
    prohibitedAssumptions: ["Remembered laws, rates or prices as answer keys", "Facts not present in the cited excerpt"],
    reviewGuidelines: "Review all critical cases and disputed grades, plus at least 20% or 30 ordinary cases.",
  },
  {
    id: "synthetic-accounting",
    version: "1",
    title: "Synthetic accounting fixture",
    status: "fixture",
    summary: "Caudals-owned synthetic policies for engine verification: decimal calculation under an explicitly supplied rule. Never customer evidence.",
    taskTypes: ["numerical"],
    requiredContext: ["the supplied synthetic policy text"],
    sourceHierarchy: ["the synthetic policy in the case"],
    rubricCriteria: [{ id: "correctness", description: "The total equals the deterministic fixture result." }],
    deterministicEvaluators: ["decimal_equal with unit and rounding", "json_schema"],
    prohibitedAssumptions: ["Treating the synthetic rate as a statutory tax rate"],
    reviewGuidelines: "Deterministic fixture; review only if the fixture changes.",
  },
];
