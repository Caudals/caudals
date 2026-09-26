"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type TaskType = "instruction" | "factual" | "reasoning" | "code" | "safety";
type MaturityLevel = "prototype" | "prelaunch" | "production";

const taskTypes: { value: TaskType; label: string; desc: string }[] = [
  { value: "instruction", label: "Instruction following", desc: "Formatting, length, style, multi-step tasks" },
  { value: "factual", label: "Factual QA", desc: "Closed-book knowledge, retrieval, citations" },
  { value: "reasoning", label: "Reasoning", desc: "Multi-hop logic, math, chain-of-thought" },
  { value: "code", label: "Code generation", desc: "Correctness, readability, edge cases" },
  { value: "safety", label: "Safety & alignment", desc: "Refusals, policy adherence, harmful outputs" },
];

const maturityLevels: { value: MaturityLevel; label: string; desc: string }[] = [
  { value: "prototype", label: "Early prototype", desc: "Testing basic capability before any deployment" },
  { value: "prelaunch", label: "Pre-launch", desc: "Validating model before shipping to real users" },
  { value: "production", label: "Production", desc: "Ongoing regression testing in a live system" },
];

type Recommendation = {
  core: number;
  adversarial: number;
  regression: number;
  total: number;
  notes: string[];
};

function getRecommendation(task: TaskType, maturity: MaturityLevel): Recommendation {
  const base: Record<TaskType, { core: number; adversarial: number }> = {
    instruction: { core: 200, adversarial: 60 },
    factual: { core: 300, adversarial: 80 },
    reasoning: { core: 150, adversarial: 50 },
    code: { core: 200, adversarial: 70 },
    safety: { core: 250, adversarial: 150 },
  };

  const multiplier: Record<MaturityLevel, number> = {
    prototype: 1,
    prelaunch: 2.5,
    production: 5,
  };

  const m = multiplier[maturity];
  const core = Math.round(base[task].core * m);
  const adversarial = Math.round(base[task].adversarial * m);
  const regression = maturity === "production" ? Math.round(core * 0.3) : 0;
  const total = core + adversarial + regression;

  const notes: string[] = [];

  if (task === "safety") {
    notes.push("Safety evals require dedicated red-team construction — random sampling misses adversarial patterns.");
  }
  if (task === "reasoning") {
    notes.push("Reasoning test cases should be author-verified: model-generated chains often contain subtle errors that contaminate the eval.");
  }
  if (task === "factual") {
    notes.push("Ensure test questions are not present in any pre-training or fine-tuning corpus to avoid contamination.");
  }
  if (task === "code") {
    notes.push("Each code test case needs an executable test suite — human-readable correctness ratings are not reliable for code.");
  }
  if (maturity === "production") {
    notes.push("Production eval sets should be refreshed quarterly as the input distribution shifts with real usage.");
    notes.push(`Regression slice (${regression} examples) covers previously-fixed failure modes to catch regressions on updates.`);
  }
  if (maturity === "prelaunch") {
    notes.push("Run human evaluation on a random 10% sample alongside automated metrics before launch.");
  }

  return { core, adversarial, regression, total, notes };
}

export function EvalDatasetPlanner() {
  const [task, setTask] = useState<TaskType>("instruction");
  const [maturity, setMaturity] = useState<MaturityLevel>("prelaunch");

  const rec = getRecommendation(task, maturity);

  return (
    <div className="my-10 border border-black/[0.08] rounded-xl overflow-hidden bg-background shadow-xs">
      <div className="px-6 py-4 border-b border-black/[0.08] bg-black/[0.02]">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Interactive · Eval Dataset Planner
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Task type */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Task type
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {taskTypes.map((t) => (
              <button
                key={t.value}
                onClick={() => setTask(t.value)}
                className={cn(
                  "text-left rounded-lg border px-4 py-3 transition-all duration-150",
                  task === t.value
                    ? "border-[#141413] bg-black/[0.04]"
                    : "border-black/[0.08] bg-background hover:border-black/[0.18] hover:bg-black/[0.015]"
                )}
              >
                <p className={cn("text-sm font-medium", task === t.value ? "text-[#141413]" : "text-gray-900")}>
                  {t.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Maturity level */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Model maturity
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {maturityLevels.map((m) => (
              <button
                key={m.value}
                onClick={() => setMaturity(m.value)}
                className={cn(
                  "text-left rounded-lg border px-4 py-3 transition-all duration-150",
                  maturity === m.value
                    ? "border-[#141413] bg-black/[0.04]"
                    : "border-black/[0.08] bg-background hover:border-black/[0.18] hover:bg-black/[0.015]"
                )}
              >
                <p className={cn("text-sm font-medium", maturity === m.value ? "text-[#141413]" : "text-gray-900")}>
                  {m.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="rounded-lg border border-black/[0.08] overflow-hidden bg-background">
          <div className="bg-black/[0.02] px-5 py-3 border-b border-black/[0.08]">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Recommended dataset size
            </p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="text-center">
                <p className="text-2xl font-semibold text-gray-900">{rec.core.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Core test cases</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-gray-900">{rec.adversarial.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Adversarial cases</p>
              </div>
              <div className="text-center">
                <p className={cn("text-2xl font-semibold", rec.regression > 0 ? "text-gray-900" : "text-gray-300")}>
                  {rec.regression > 0 ? rec.regression.toLocaleString() : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-1">Regression slice</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-black/[0.04] px-4 py-3">
              <p className="text-sm font-medium text-[#141413]">Total recommended</p>
              <p className="text-xl font-semibold text-[#141413]">{rec.total.toLocaleString()} examples</p>
            </div>

            {rec.notes.length > 0 && (
              <ul className="mt-4 space-y-2">
                {rec.notes.map((note, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-black/[0.04] flex items-center justify-center text-[10px] font-bold text-gray-600">
                      {i + 1}
                    </span>
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Estimates are starting-point ranges. Actual requirements depend on annotator agreement targets, coverage depth, and how uniform your input distribution is.
        </p>
      </div>
    </div>
  );
}
