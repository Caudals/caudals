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
    <section className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-12">
        <div className="rounded-[1.5rem] border border-border/80 bg-card p-6 sm:rounded-[2.4rem] sm:p-8 lg:p-10">
          <div className="mb-8 text-center sm:mb-10">
            <p className="text-xs font-semibold uppercase text-slate-500">
              {t("Proof in numbers")}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl lg:text-4xl">
              {t("Scaling frontier AI responsibly")}
            </h2>
            <p className="mt-3 text-sm text-slate-500 sm:text-base">
              {t(
                "Every metric combines human expertise and automation so you can trust the workflow end to end.",
              )}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                viewport={{ once: true, margin: "-60px" }}
                className="rounded-2xl border border-border/70 bg-white p-5 text-left sm:rounded-3xl sm:p-6"
              >
                <div className="text-3xl font-semibold text-foreground sm:text-4xl">{stat.value}</div>
                <p className="mt-2 text-xs font-semibold uppercase text-slate-500 sm:text-sm">
                  {t(stat.label)}
                </p>
                <p className="mt-2 text-xs text-slate-500 sm:text-sm">
                  {t(stat.description)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
