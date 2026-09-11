"use client";

import { motion } from "framer-motion";
import { useTranslations } from "@/lib/i18n/use-translations";

export function StatsSection() {
  const t = useTranslations();
  const stats = [
    {
      value: "48 h",
      label: "Reality Check",
      description: "Forty questions to your public assistant, with the report two days later.",
    },
    {
      value: "150–300",
      label: "Cases in a pilot",
      description: "Drawn from your documentation, real customer questions and your expert.",
    },
    {
      value: "90 min",
      label: "With your expert",
      description: "One structured session defines what a correct answer is.",
    },
    {
      value: "2 weeks",
      label: "To a live readout",
      description: "From kickoff to the report, presented to your team.",
    },
  ];

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("What to expect")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("Small enough to start this month")}
          </h2>
          <p className="text-base text-gray-500 mt-6 leading-relaxed">
            {t("No platform to adopt. We do the work and hand you the evidence.")}
          </p>
        </div>

        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true, margin: "-60px" }}
              className="flex flex-col items-start"
            >
              <div className="text-4xl font-normal tracking-tight text-black sm:text-5xl mb-4 tabular-nums">
                {t(stat.value)}
              </div>
              <p className="text-sm font-bold text-black mb-2 uppercase tracking-wide">
                {t(stat.label)}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {t(stat.description)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
