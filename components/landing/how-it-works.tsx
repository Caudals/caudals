"use client";

import { motion } from "framer-motion";
import {
  ClipboardCheck,
  Database,
  FileSearch,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";
import { EVALUATION_STEPS, type EvaluationStepId } from "@/lib/public/evaluation-offers";

const stepIcons: Record<EvaluationStepId, LucideIcon> = {
  evaluate: FileSearch,
  report: ClipboardCheck,
  subscribe: RefreshCw,
  build: Database,
};

export function HowItWorksSection() {
  const t = useTranslations();

  return (
    <section className="py-24 sm:py-32 bg-white overflow-hidden">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12 text-center">
        <div className="mb-16 mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("How it works")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("Evidence first. Everything else follows.")}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-gray-500">
            {t(
              "Each step leaves you with something you keep, and tells you whether the next one is worth doing.",
            )}
          </p>
        </div>

        <div className="grid gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden sm:grid-cols-2 lg:grid-cols-4 text-left">
          {EVALUATION_STEPS.map((step, index) => {
            const Icon = stepIcons[step.id];
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                viewport={{ once: true, margin: "-60px" }}
                className="bg-white p-8 flex flex-col items-start group hover:bg-gray-50/50 transition-colors"
              >
                <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-600 transition-transform group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-[10px] font-bold text-teal-600 mb-2">
                  {t("Step 0{{index}}", { index: index + 1 })}
                </p>
                <h3 className="text-lg font-bold text-black mb-3">{t(step.label)}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {t(step.description)}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
