import { z } from "zod";

export const improvementOutcomeSchema = z.enum(["pass", "partial", "fail", "unscorable"]);
export type ImprovementOutcome = z.infer<typeof improvementOutcomeSchema>;
export type OutcomeByCase = Record<string, ImprovementOutcome>;
export type ImprovementSplit = "training" | "validation" | "holdout";
export type SplitComparison = {
  count: number;
  excluded: number;
  baselineScore: number | null;
  followupScore: number | null;
  delta: number | null;
};

const score: Record<Exclude<ImprovementOutcome, "unscorable">, number> = {
  pass: 1, partial: 0.5, fail: 0,
};

export function compareImprovementRuns(input: {
  baseline: OutcomeByCase;
  followup: OutcomeByCase;
  cases: Array<{ revisionId: string; familyId: string; split: ImprovementSplit }>;
}) {
  const revisions = new Set<string>(); const familySplits = new Map<string, ImprovementSplit>();
  for (const candidate of input.cases) {
    z.string().min(1).max(200).parse(candidate.revisionId);
    z.string().min(1).max(200).parse(candidate.familyId);
    z.enum(["training", "validation", "holdout"]).parse(candidate.split);
    if (revisions.has(candidate.revisionId)) throw new Error("duplicate_case_revision");
    revisions.add(candidate.revisionId);
    const prior = familySplits.get(candidate.familyId);
    if (prior && prior !== candidate.split) throw new Error("family_split_overlap");
    familySplits.set(candidate.familyId, candidate.split);
  }
  function split(kind: ImprovementSplit): SplitComparison {
    const candidates = input.cases.filter((candidate) => candidate.split === kind);
    const included: Array<{ baseline: number; followup: number }> = [];
    for (const candidate of candidates) {
      const baseline = input.baseline[candidate.revisionId]; const followup = input.followup[candidate.revisionId];
      if (!baseline || !followup || baseline === "unscorable" || followup === "unscorable") continue;
      included.push({ baseline: score[baseline], followup: score[followup] });
    }
    if (!included.length) return { count: 0, excluded: candidates.length, baselineScore: null, followupScore: null, delta: null };
    const baselineScore = included.reduce((sum, row) => sum + row.baseline, 0) / included.length;
    const followupScore = included.reduce((sum, row) => sum + row.followup, 0) / included.length;
    return { count: included.length, excluded: candidates.length - included.length, baselineScore, followupScore, delta: followupScore - baselineScore };
  }
  return {
    training: split("training"), validation: split("validation"), holdout: split("holdout"),
    causality: "observational_after_recorded_intervention" as const,
    limitations: [
      "This before/after comparison records an observed association and does not prove causality.",
      "Configuration, model, traffic and source changes between runs may contribute to the measured difference.",
      "Training, validation and untouched holdout results are reported separately; gains on training items are not held-out evidence.",
    ],
  };
}
