"use client";

import { motion } from "framer-motion";
import { useTranslations } from "@/lib/i18n/use-translations";

export function StatsSection() {
  const t = useTranslations();
  const stats = [
    {
      value: "12M+",
      label: "Approved data points",
      description: "Image, text, sensor, and multimodal submissions cleared through QA.",
    },
    {
      value: "52K",
      label: "Certified contributors",
      description: "120+ countries, 40+ languages, every major device category.",
    },
    {
      value: "95%",
      label: "Acceptance score",
      description: "Average consensus score across reviewer pods.",
    },
    {
      value: "<48h",
      label: "Time to first batch",
      description: "From blueprint approval to first accepted submission.",
    },
  ];

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Proof in numbers")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("Scaling frontier AI responsibly")}
          </h2>
          <p className="text-base text-gray-500 mt-6 leading-relaxed">
            {t(
              "Every metric combines human expertise and automation so you can trust the workflow end to end.",
            )}
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
                {stat.value}
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
