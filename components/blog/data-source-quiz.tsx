"use client";

import { useState } from "react";

type QuestionId =
  | "distribution"
  | "privacy"
  | "nuance"
  | "volume"
  | "existing";

type Question = {
  id: QuestionId;
  text: string;
  hint: string;
  syntheticWeight: number; // positive = favors synthetic, negative = favors human
};

const QUESTIONS: Question[] = [
  {
    id: "distribution",
    text: "Is your target data distribution well-defined and bounded?",
    hint: "e.g., structured inputs, known label taxonomy, constrained language domain",
    syntheticWeight: 2,
  },
  {
    id: "privacy",
    text: "Does your task involve privacy-sensitive or legally restricted data?",
    hint: "e.g., medical records, financial data, personal communications",
    syntheticWeight: 3,
  },
  {
    id: "nuance",
    text: "Does the task require capturing open-ended human behavior or judgment?",
    hint: "e.g., natural conversation, creative output, ambiguous decisions",
    syntheticWeight: -3,
  },
  {
    id: "volume",
    text: "Do you need more than 50,000 labeled examples?",
    hint: "Large-scale volumes shift the cost-per-example advantage toward generation",
    syntheticWeight: 2,
  },
  {
    id: "existing",
    text: "Do you already have real examples to validate against?",
    hint: "Even 500–1,000 real samples dramatically improve synthetic quality and trust",
    syntheticWeight: -1,
  },
];

type Recommendation = "synthetic" | "human" | "hybrid";

type RecommendationConfig = {
  label: string;
  tagline: string;
  points: string[];
  cta: string;
};

const RECOMMENDATIONS: Record<Recommendation, RecommendationConfig> = {
  synthetic: {
    label: "Synthetic-first",
    tagline: "Your use case is well-suited for generated data.",
    points: [
      "Generate at scale with a seed corpus or template set.",
      "Use a small human-reviewed validation set to measure drift.",
      "Audit distribution coverage before training — synthetic pipelines can silently undersample edge cases.",
    ],
    cta: "If you move to production, run a human spot-check on 2–5% of synthetic samples each batch.",
  },
  human: {
    label: "Human-collected",
    tagline: "Real contributors will produce more reliable signal for this task.",
    points: [
      "Define clear task instructions and acceptance criteria before sourcing contributors.",
      "Invest in reviewer capacity — human data quality is only as good as your review process.",
      "Start with a pilot batch (100–500 submissions) to calibrate rejection rates before scaling.",
    ],
    cta: "Use Caudals to scope your collection contract, model reviewer load, and track payout budgets before launch.",
  },
  hybrid: {
    label: "Hybrid approach",
    tagline: "A mix of synthetic and human data is likely your best path.",
    points: [
      "Use synthetic generation to fill volume gaps or rare class coverage.",
      "Use human collection for core behavioral signal, edge cases, and validation.",
      "Keep synthetic and human data clearly labeled in your training pipeline — mixing without tracking makes debugging hard.",
    ],
    cta: "Structure your human collection through a platform like Caudals to keep the real-data layer well-controlled as volumes grow.",
  },
};

function scoreToRecommendation(score: number): Recommendation {
  if (score >= 5) return "synthetic";
  if (score <= -2) return "human";
  return "hybrid";
}

export function DataSourceQuiz() {
  const [step, setStep] = useState<number>(0); // 0 = intro, 1..N = questions, N+1 = result
  const [answers, setAnswers] = useState<Record<QuestionId, boolean | null>>(
    {} as Record<QuestionId, boolean | null>
  );

  const total = QUESTIONS.length;
  const isIntro = step === 0;
  const isResult = step === total + 1;
  const currentQuestion = !isIntro && !isResult ? QUESTIONS[step - 1] : null;

  function handleAnswer(value: boolean) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
    setStep((s) => s + 1);
  }

  function getScore() {
    return QUESTIONS.reduce((acc, q) => {
      const answer = answers[q.id];
      if (answer === true) return acc + q.syntheticWeight;
      return acc;
    }, 0);
  }

  function reset() {
    setStep(0);
    setAnswers({} as Record<QuestionId, boolean | null>);
  }

  const score = isResult ? getScore() : 0;
  const recommendation = isResult ? RECOMMENDATIONS[scoreToRecommendation(score)] : null;
  const progress = isIntro ? 0 : isResult ? 100 : Math.round(((step - 1) / total) * 100);

  return (
    <div className="my-10 border border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Interactive tool
        </p>
        <h3 className="mt-1 text-xl font-normal text-black">
          Synthetic vs. human data: which fits your use case?
        </h3>
      </div>

      {/* Progress bar */}
      {!isIntro && (
        <div className="h-px w-full bg-gray-100">
          <div
            className="h-px bg-black transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="px-6 py-8">
        {/* Intro */}
        {isIntro && (
          <div className="max-w-lg">
            <p className="text-lg text-black leading-relaxed mb-6">
              Answer five questions about your dataset requirements. You&apos;ll get a recommendation - synthetic-first, human-collected, or hybrid - with concrete next steps.
            </p>
            <button
              onClick={() => setStep(1)}
              className="border border-black px-6 py-2 text-sm font-medium text-black hover:bg-black hover:text-white transition-colors"
            >
              Start quiz
            </button>
          </div>
        )}

        {/* Question */}
        {currentQuestion && (
          <div className="max-w-lg">
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-400">
              Question {step} of {total}
            </p>
            <p className="mt-4 text-xl font-normal text-black leading-snug mb-3">
              {currentQuestion.text}
            </p>
            <p className="text-sm text-gray-400 mb-8">{currentQuestion.hint}</p>
            <div className="flex gap-4">
              <button
                onClick={() => handleAnswer(true)}
                className="border border-black px-8 py-2 text-sm font-medium text-black hover:bg-black hover:text-white transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => handleAnswer(false)}
                className="border border-gray-200 px-8 py-2 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-black transition-colors"
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* Result */}
        {isResult && recommendation && (
          <div className="max-w-lg">
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-400">
              Recommendation
            </p>
            <h4 className="mt-4 text-2xl font-normal text-black mb-1">
              {recommendation.label}
            </h4>
            <p className="text-lg text-gray-600 mb-8">{recommendation.tagline}</p>

            <div className="space-y-3 mb-8">
              {recommendation.points.map((point, i) => (
                <div key={i} className="flex gap-3">
                  <span className="mt-1 flex-shrink-0 text-xs font-medium text-gray-300 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm text-black leading-relaxed">{point}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-6 mb-6">
              <p className="text-sm text-gray-500 leading-relaxed">{recommendation.cta}</p>
            </div>

            <button
              onClick={reset}
              className="text-sm text-gray-400 underline underline-offset-4 hover:text-black transition-colors"
            >
              Retake quiz
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
