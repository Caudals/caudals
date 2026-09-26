"use client";

import type { ReactNode } from "react";
import { Deliverables } from "@/components/landing/diagrams/deliverables";
import { ExpertNetwork } from "@/components/landing/diagrams/expert-network";
import { FailureModes } from "@/components/landing/diagrams/failure-modes";
import { GrowthChart } from "@/components/landing/diagrams/growth";
import { PipelineDiagram } from "@/components/landing/diagrams/pipeline";
import { useTranslations } from "@/lib/i18n/context";

/** The five steps, in reading order: each is a title, one line and a figure. */
const STEPS: readonly { id: "how" | "exam" | "experts" | "deliver" | "improve"; figure: ReactNode }[] = [
  { id: "how", figure: <PipelineDiagram /> },
  { id: "exam", figure: <FailureModes /> },
  { id: "experts", figure: <ExpertNetwork /> },
  { id: "deliver", figure: <Deliverables /> },
  { id: "improve", figure: <GrowthChart /> },
];

export function StepsSection() {
  const t = useTranslations("steps");

  return (
    <section id="how-it-works" className="lp-wrap lp-steps" aria-label={t("label")}>
      {STEPS.map(({ id, figure }, index) => (
        <article key={id} className="lp-step" aria-labelledby={`step-${id}`}>
          <p className="lp-step-num" aria-hidden="true">
            {index + 1}
          </p>
          <div className="lp-step-body lp-rv">
            <h2 id={`step-${id}`} className="lp-h2">
              {t(`${id}.title`)}
            </h2>
            <p className="lp-lede">{t(`${id}.description`)}</p>
          </div>
          <div className="lp-step-fig lp-rv">{figure}</div>
        </article>
      ))}
    </section>
  );
}
