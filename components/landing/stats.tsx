"use client";

import { motion } from "framer-motion";
import { useTranslations } from "@/lib/i18n/context";

/** Ordered ids; the copy for each lives in the message files. */
const statIds = ["diagnostic", "cases", "session", "readout"] as const;

export function StatsSection() {
  const t = useTranslations("stats");

  return (
    <section className="py-24 sm:py-32 bg-background">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("eyebrow")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl text-balance">
            {t("title")}
          </h2>
          <p className="text-base text-gray-500 mt-6 leading-relaxed text-balance">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {statIds.map((id, index) => (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true, margin: "-60px" }}
              className="flex flex-col items-start"
            >
              <div className="text-4xl font-normal tracking-tight text-black sm:text-5xl mb-4 tabular-nums">
                {t(`items.${id}.value`)}
              </div>
              <p className="text-sm font-bold text-black mb-2 uppercase tracking-wide">
                {t(`items.${id}.label`)}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {t(`items.${id}.description`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
