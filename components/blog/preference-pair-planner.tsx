"use client";

import { useState } from "react";

type BehaviorScope = "narrow" | "medium" | "broad";
type ModelStage = "pretrained" | "sft" | "rlhf";
type AnnotatorProfile = "crowd" | "calibrated" | "expert";

const SCOPE_LABELS: Record<BehaviorScope, string> = {
  narrow: "Narrow — 1 or 2 behaviors",
  medium: "Medium — 3 to 6 behaviors",
  broad: "Broad — 7+ behaviors or open-ended",
};

const STAGE_LABELS: Record<ModelStage, string> = {
  pretrained: "Pre-trained only (no SFT)",
  sft: "SFT checkpoint (instruction-tuned)",
  rlhf: "Already RLHF'd (iterative round)",
};

const ANNOTATOR_LABELS: Record<AnnotatorProfile, string> = {
  crowd: "General crowd annotators",
  calibrated: "Calibrated crowd with rubric training",
  expert: "Domain experts or specialists",
};

interface PlannerResult {
  pairsLow: number;
  pairsHigh: number;
  rewardModelNote: string;
  taskNote: string;
  annotatorNote: string;
}

function getEstimate(
  scope: BehaviorScope,
  stage: ModelStage,
  profile: AnnotatorProfile
): PlannerResult {
  const scopeBase: Record<BehaviorScope, [number, number]> = {
    narrow: [2000, 6000],
    medium: [8000, 20000],
    broad: [25000, 80000],
  };

  const stageMultiplier: Record<ModelStage, number> = {
    pretrained: 1.5,
    sft: 1.0,
    rlhf: 0.6,
  };

  const profileMultiplier: Record<AnnotatorProfile, number> = {
    crowd: 1.3,
    calibrated: 1.0,
    expert: 0.7,
  };

  const [baseLow, baseHigh] = scopeBase[scope];
  const sm = stageMultiplier[stage];
  const am = profileMultiplier[profile];

  const raw = (n: number) => Math.round((n * sm * am) / 500) * 500;

  const rewardModelNotes: Record<ModelStage, string> = {
    pretrained:
      "Training a reward model from scratch on a pre-trained base requires more preference pairs to establish consistent signal. Plan for significant inter-annotator agreement calibration before scaling.",
    sft:
      "An SFT checkpoint already exhibits coherent behavior, which makes preference contrasts cleaner and easier to judge. This is the most common and effective starting point for RLHF.",
    rlhf:
      "Iterative RLHF rounds target residual failure modes and edge cases. Pairs are harder to write — both outputs will look good, so annotators need sharper rubrics and tighter calibration.",
  };

  const taskNotes: Record<BehaviorScope, string> = {
    narrow:
      "With a narrow scope, each preference pair should hold the topic and format constant and vary only along the target behavior dimension. This keeps the signal clean and the reward model well-defined.",
    medium:
      "With a medium scope, consider batching pairs by behavior cluster during collection. Mixing all behaviors in a single task makes calibration harder and increases annotator disagreement.",
    broad:
      "Broad scope requires systematic coverage planning. A random sample of prompts will underrepresent rare but important behaviors. Stratify by topic, register, difficulty, and edge case type to avoid gaps.",
  };

  const annotatorNotes: Record<AnnotatorProfile, string> = {
    crowd:
      "General crowd annotators work for surface-level quality signals (fluency, factual tone, instruction adherence). They struggle with nuanced tradeoffs. Invest heavily in rubric clarity and reject ambiguous tasks at design time.",
    calibrated:
      "A calibrated crowd with shared rubric training produces the best cost-to-quality ratio for most RLHF programs. Plan 2 to 3 calibration batches before full collection begins.",
    expert:
      "Domain experts produce the highest-signal preference data but at 3 to 5 times the per-annotation cost. Reserve expert annotation for behaviors where subjective judgment is genuinely required — legal, medical, highly technical domains.",
  };

  return {
    pairsLow: raw(baseLow),
    pairsHigh: raw(baseHigh),
    rewardModelNote: rewardModelNotes[stage],
    taskNote: taskNotes[scope],
    annotatorNote: annotatorNotes[profile],
  };
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

export function PreferencePairPlanner() {
  const [scope, setScope] = useState<BehaviorScope>("medium");
  const [stage, setStage] = useState<ModelStage>("sft");
  const [profile, setProfile] = useState<AnnotatorProfile>("calibrated");

  const result = getEstimate(scope, stage, profile);

  return (
    <div className="my-10 rounded-xl border border-black/[0.08] bg-background shadow-xs overflow-hidden">
      <div className="border-b border-black/[0.08] px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Preference pair estimator
        </p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Behavior scope */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Behavior scope
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(SCOPE_LABELS) as BehaviorScope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`text-left px-4 py-3 border text-sm transition-colors rounded-lg ${
                  scope === s
                    ? "border-black bg-gray-900 text-white"
                    : "border-black/[0.12] text-gray-700 hover:border-black/[0.25]"
                }`}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Model stage */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Model checkpoint
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(STAGE_LABELS) as ModelStage[]).map((s) => (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={`text-left px-4 py-3 border text-sm transition-colors rounded-lg ${
                  stage === s
                    ? "border-black bg-gray-900 text-white"
                    : "border-black/[0.12] text-gray-700 hover:border-black/[0.25]"
                }`}
              >
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Annotator profile */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Annotator profile
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(ANNOTATOR_LABELS) as AnnotatorProfile[]).map((a) => (
              <button
                key={a}
                onClick={() => setProfile(a)}
                className={`text-left px-4 py-3 border text-sm transition-colors rounded-lg ${
                  profile === a
                    ? "border-black bg-gray-900 text-white"
                    : "border-black/[0.12] text-gray-700 hover:border-black/[0.25]"
                }`}
              >
                {ANNOTATOR_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="border-t border-black/[0.08] px-6 py-6 bg-black/[0.02]">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">
            Estimated comparison pairs
          </p>
          <p className="text-4xl font-light tracking-tight text-black">
            {fmt(result.pairsLow)}–{fmt(result.pairsHigh)}
          </p>
          <p className="text-sm text-gray-500 mt-1">preference pairs</p>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">
              On model stage
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{result.rewardModelNote}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">
              On task design
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{result.taskNote}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-1">
              On annotators
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{result.annotatorNote}</p>
          </div>
        </div>

        <p className="mt-6 text-xs text-gray-400">
          These ranges are order-of-magnitude starting points. Actual requirements depend on reward model architecture, PPO stability, and how tightly behaviors are defined.
        </p>
      </div>
    </div>
  );
}
