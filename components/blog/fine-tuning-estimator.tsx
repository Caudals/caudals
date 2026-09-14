"use client";

import { useState } from "react";

type TaskType = "classification" | "summarization" | "instruction" | "conversational" | "domain";
type ModelSize = "small" | "medium" | "large" | "xl";
type QualityTarget = "baseline" | "good" | "high" | "best";

interface Estimate {
  low: number;
  high: number;
  unit: string;
  note: string;
  qualityNote: string;
}

const TASK_LABELS: Record<TaskType, string> = {
  classification: "Classification / labeling",
  summarization: "Summarization",
  instruction: "Instruction following",
  conversational: "Conversational / chat",
  domain: "Domain adaptation",
};

const MODEL_LABELS: Record<ModelSize, string> = {
  small: "Small (< 3B params)",
  medium: "Medium (3–13B)",
  large: "Large (13–70B)",
  xl: "Very large (70B+)",
};

const QUALITY_LABELS: Record<QualityTarget, string> = {
  baseline: "Baseline — good enough to test",
  good: "Good — usable in production",
  high: "High — competitive quality",
  best: "Best-in-class — every edge case covered",
};

function getEstimate(task: TaskType, model: ModelSize, quality: QualityTarget): Estimate {
  const base: Record<TaskType, [number, number]> = {
    classification: [500, 2000],
    summarization: [1000, 5000],
    instruction: [2000, 10000],
    conversational: [3000, 15000],
    domain: [1500, 8000],
  };

  const modelMultiplier: Record<ModelSize, number> = {
    small: 1,
    medium: 0.7,
    large: 0.5,
    xl: 0.4,
  };

  const qualityMultiplier: Record<QualityTarget, number> = {
    baseline: 1,
    good: 2,
    high: 4,
    best: 8,
  };

  const [baseLow, baseHigh] = base[task];
  const m = modelMultiplier[model];
  const q = qualityMultiplier[quality];

  const low = Math.round((baseLow * m * q) / 100) * 100;
  const high = Math.round((baseHigh * m * q) / 100) * 100;

  const notes: Record<TaskType, string> = {
    classification: "Classification tasks have a well-defined label space, so the model learns quickly. Invest in label consistency over volume.",
    summarization: "Summarization needs diverse source documents. Coverage of edge cases (very short, very long, domain-specific) matters more than raw count.",
    instruction: "Instruction tuning benefits enormously from quality: one well-crafted example is worth ten mediocre ones. Prioritize precise, varied instructions.",
    conversational: "Conversational data must reflect real user expression — distributions, disfluencies, topic shifts. Artificially generated examples tend to underperform.",
    domain: "Domain adaptation is often bottlenecked by terminology coverage. Audit vocabulary gaps before scaling volume.",
  };

  const qualityNotes: Record<QualityTarget, string> = {
    baseline: "At baseline quality, expect significant failure modes that need monitoring. Suitable for internal testing or low-stakes applications.",
    good: "Good quality gets you to a reliable production baseline. Expect ~10–20% edge cases to need manual review or fallback logic.",
    high: "High quality requires systematic review rubrics and calibrated annotators. Budget for 1.5–2x the reviewer time per submission.",
    best: "Best-in-class datasets require adversarial examples, edge case coverage, and multiple review passes. Expect 3–4x the cost of a baseline program.",
  };

  return {
    low,
    high,
    unit: "examples",
    note: notes[task],
    qualityNote: qualityNotes[quality],
  };
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

export function FineTuningEstimator() {
  const [task, setTask] = useState<TaskType>("instruction");
  const [model, setModel] = useState<ModelSize>("medium");
  const [quality, setQuality] = useState<QualityTarget>("good");

  const estimate = getEstimate(task, model, quality);

  return (
    <div className="my-10 rounded-xl border border-black/[0.08] bg-background shadow-xs overflow-hidden">
      <div className="border-b border-black/[0.08] px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Fine-tuning data estimator
        </p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Task type */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Task type
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(TASK_LABELS) as TaskType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTask(t)}
                className={`text-left px-4 py-3 border text-sm transition-colors rounded-lg ${
                  task === t
                    ? "border-black bg-gray-900 text-white"
                    : "border-black/[0.12] text-gray-700 hover:border-black/[0.25]"
                }`}
              >
                {TASK_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Model size */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Base model size
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(MODEL_LABELS) as ModelSize[]).map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                className={`px-4 py-3 border text-sm transition-colors rounded-lg ${
                  model === m
                    ? "border-black bg-gray-900 text-white"
                    : "border-black/[0.12] text-gray-700 hover:border-black/[0.25]"
                }`}
              >
                {MODEL_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Quality target */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Quality target
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(QUALITY_LABELS) as QualityTarget[]).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`text-left px-4 py-3 border text-sm transition-colors rounded-lg ${
                  quality === q
                    ? "border-black bg-gray-900 text-white"
                    : "border-black/[0.12] text-gray-700 hover:border-black/[0.25]"
                }`}
              >
                {QUALITY_LABELS[q]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="border-t border-black/[0.08] px-6 py-6 bg-black/[0.02]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">
              Estimated range
            </p>
            <p className="text-4xl font-light tracking-tight text-black">
              {formatNumber(estimate.low)}–{formatNumber(estimate.high)}
            </p>
            <p className="text-sm text-gray-500 mt-1">labeled examples</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-sm text-gray-700 leading-relaxed">{estimate.note}</p>
          <p className="text-sm text-gray-500 leading-relaxed">{estimate.qualityNote}</p>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Estimates are starting-point ranges based on common fine-tuning patterns. Actual requirements vary with data diversity, annotation quality, and evaluation criteria.
        </p>
      </div>
    </div>
  );
}
