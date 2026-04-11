"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const steps = [
  {
    id: 1,
    label: "Train on labeled data",
    labelEs: "Entrena con datos etiquetados",
    description:
      "The model trains on your current labeled dataset. In the first round, this is typically a small seed set — a few hundred examples chosen for coverage rather than volume. The model is functional but uncertain across much of the input space.",
    stat: "Seed set: 200–500 labeled examples",
  },
  {
    id: 2,
    label: "Score the unlabeled pool",
    labelEs: "Puntúa el conjunto sin etiquetar",
    description:
      "The model runs inference over every unlabeled example and produces a confidence score. Low confidence signals that the model is uncertain about how to handle that input — which is exactly where new labels would help most.",
    stat: "Pool: 10,000–100,000 unlabeled examples",
  },
  {
    id: 3,
    label: "Select the most uncertain",
    labelEs: "Selecciona los más inciertos",
    description:
      "Examples with the lowest confidence scores are selected as the next batch to label. This is uncertainty sampling — the simplest and most widely used active learning strategy. More sophisticated strategies also consider diversity and expected model improvement.",
    stat: "Query batch: top 100–500 most uncertain",
  },
  {
    id: 4,
    label: "Label the query batch",
    labelEs: "Etiqueta el lote seleccionado",
    description:
      "Human annotators review and label only the selected examples. Because these are the most informative examples in the pool, each label carries more signal than a randomly chosen one. The annotation effort is concentrated where it matters.",
    stat: "Annotation cost: 5–10% of full pool labeling",
  },
  {
    id: 5,
    label: "Add to training set and repeat",
    labelEs: "Añade al conjunto y repite",
    description:
      "The newly labeled examples join the training set. The loop restarts with a larger, smarter dataset. Each round, the model focuses its learning on the parts of the space it found hardest — converging faster than random collection ever could.",
    stat: "Typical reduction: 30–60% fewer labels needed",
  },
];

export function ActiveLearningLoop() {
  const [activeStep, setActiveStep] = useState(0);

  const step = steps[activeStep];

  function next() {
    setActiveStep((s) => (s + 1) % steps.length);
  }

  function prev() {
    setActiveStep((s) => (s - 1 + steps.length) % steps.length);
  }

  return (
    <div className="my-10 border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Interactive · Active Learning Loop
        </p>
      </div>

      {/* Steps row */}
      <div className="px-6 pt-8 pb-2">
        <div className="flex items-start gap-0">
          {steps.map((s, i) => {
            const isActive = i === activeStep;
            const isDone = i < activeStep;
            return (
              <div key={s.id} className="flex items-start flex-1 min-w-0">
                <div className="flex flex-col items-center flex-1 min-w-0">
                  {/* Circle */}
                  <button
                    onClick={() => setActiveStep(i)}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-200 focus:outline-none",
                      isActive
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                        : isDone
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                    )}
                  >
                    {isDone ? (
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M3 8l3.5 3.5 6.5-7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      s.id
                    )}
                  </button>
                  {/* Label */}
                  <p
                    className={cn(
                      "mt-2 text-center text-[11px] leading-tight px-1 transition-colors",
                      isActive
                        ? "text-emerald-700 font-medium"
                        : "text-gray-400"
                    )}
                  >
                    {s.label}
                  </p>
                </div>
                {/* Connector */}
                {i < steps.length - 1 && (
                  <div className="flex items-center mt-4 flex-shrink-0 w-4 md:w-8">
                    <div
                      className={cn(
                        "h-px w-full transition-colors duration-300",
                        i < activeStep ? "bg-emerald-400" : "bg-gray-200"
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail card */}
      <div className="mx-6 mb-6 mt-4 rounded-lg border border-gray-100 bg-gray-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-1">
              Step {step.id} of {steps.length}
            </p>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {step.label}
            </h3>
            <p className="text-sm leading-relaxed text-gray-600">
              {step.description}
            </p>
          </div>
        </div>
        <div className="mt-4 inline-flex items-center rounded-md bg-emerald-50 px-3 py-1.5">
          <span className="text-xs font-medium text-emerald-700">{step.stat}</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
        <button
          onClick={prev}
          disabled={activeStep === 0}
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium transition-colors",
            activeStep === 0
              ? "cursor-not-allowed text-gray-300"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 12L6 8l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Previous
        </button>

        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveStep(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                i === activeStep
                  ? "w-4 bg-emerald-600"
                  : "w-1.5 bg-gray-300 hover:bg-gray-400"
              )}
            />
          ))}
        </div>

        <button
          onClick={next}
          disabled={activeStep === steps.length - 1}
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium transition-colors",
            activeStep === steps.length - 1
              ? "cursor-not-allowed text-gray-300"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          Next
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path
              d="M6 12l4-4-4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
