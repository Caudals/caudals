"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  Blocks,
  FlaskConical,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/context";
import {
  EVALUATION_STEP_IDS,
  type EvaluationStepId,
} from "@/lib/public/evaluation-offers";

const stepIcons: Record<EvaluationStepId, LucideIcon> = {
  evaluate: FlaskConical,
  report: BarChart3,
  subscribe: Repeat,
  build: Blocks,
};

export function HowItWorksSection() {
  const t = useTranslations("howItWorks");

  return (
    <section className="py-24 sm:py-32 bg-background overflow-hidden">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12 text-center">
        <div className="mb-16 mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("eyebrow")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl text-balance">
            {t("title")}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-gray-500 text-balance">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid gap-px bg-black/[0.08] border border-black/[0.08] rounded-xl overflow-hidden sm:grid-cols-2 lg:grid-cols-4 text-left shadow-sm">
          {EVALUATION_STEP_IDS.map((stepId, index) => {
            const Icon = stepIcons[stepId];
            return (
              <motion.div
                key={stepId}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                viewport={{ once: true, margin: "-60px" }}
                className="bg-background p-8 flex flex-col items-start group"
              >
                <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg border border-black/[0.08] bg-black/[0.03] text-neutral-700 transition-all duration-300 group-hover:border-black/[0.18] group-hover:bg-black/[0.06] group-hover:text-black group-hover:-translate-y-0.5">
                  <Icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-105" strokeWidth={1.5} />
                </div>
                <p className="text-[11px] font-medium font-mono text-neutral-500 uppercase tracking-wider mb-2 transition-colors duration-300 group-hover:text-black">
                  {t("step", { index: index + 1 })}
                </p>
                <h3 className="text-lg font-bold text-black mb-3">{t(`steps.${stepId}.label`)}</h3>
                <p className="text-sm text-gray-500 leading-relaxed transition-colors duration-300 group-hover:text-gray-700">
                  {t(`steps.${stepId}.description`)}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
