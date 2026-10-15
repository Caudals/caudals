import type { ReactNode } from "react";
import { ClientMessages } from "@/components/i18n/client-messages";
import { Deliverables } from "@/components/landing/diagrams/deliverables";
import { ExpertNetwork } from "@/components/landing/diagrams/expert-network";
import { FailureModes } from "@/components/landing/diagrams/failure-modes";
import { GrowthChart } from "@/components/landing/diagrams/growth";
import { PipelineDiagram } from "@/components/landing/diagrams/pipeline";
import type { Locale } from "@/lib/i18n/config";
import { createScopedTranslator } from "@/lib/i18n/messages";

/**
 * The five steps, in reading order: each is a title, one line and a figure.
 * Rendered on the server; the animated figures (pipeline, failure modes,
 * growth) hydrate with only their own messages (launch L-24b).
 */
export function StepsSection({ locale }: { locale: Locale }) {
  const t = createScopedTranslator(locale, "steps");
  const steps: readonly { id: "how" | "exam" | "experts" | "deliver" | "improve"; figure: ReactNode }[] = [
    { id: "how", figure: <PipelineDiagram /> },
    { id: "exam", figure: <FailureModes /> },
    { id: "experts", figure: <ExpertNetwork locale={locale} /> },
    { id: "deliver", figure: <Deliverables locale={locale} /> },
    { id: "improve", figure: <GrowthChart /> },
  ];

  return (
    <ClientMessages locale={locale} groups={["steps.how", "steps.exam", "steps.improve"]}>
      <section id="how-it-works" className="lp-wrap lp-steps" aria-label={t("label")}>
        {steps.map(({ id, figure }, index) => (
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
    </ClientMessages>
  );
}
