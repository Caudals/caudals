"use client";

import { motion } from "framer-motion";
import {
  Database,
  ShieldCheck,
  Zap,
  Activity,
  BarChart3,
  Globe2,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

const capabilities = [
  {
    icon: Database,
    title: "Any data type, any format",
    description:
      "Tabular, image, text, audio, sensor, and geospatial data. We convert everything to ML-ready formats like Parquet, JSON-Lines, and TFRecords.",
  },
  {
    icon: Globe2,
    title: "Cross-industry sourcing",
    description:
      "Need data from logistics, healthcare, retail, or agriculture? We source from companies across verticals and combine it with public datasets.",
  },
  {
    icon: ShieldCheck,
    title: "GDPR and compliance built-in",
    description:
      "PII detection, automated anonymization, data processing agreements, and full audit trails keep your legal team confident.",
  },
  {
    icon: Zap,
    title: "Delivery in days, not months",
    description:
      "Catalog datasets available immediately. Custom sourced datasets delivered in 1-3 weeks with quality validation included.",
  },
  {
    icon: Activity,
    title: "Quality scores on every dataset",
    description:
      "Completeness, consistency, freshness, and accuracy metrics published per dataset. Preview samples before buying.",
  },
  {
    icon: BarChart3,
    title: "Transparent pricing",
    description:
      "Pay per dataset or subscribe for ongoing access. Suppliers earn revenue share on every sale. No hidden fees.",
  },
];

export function FeaturesSection() {
  const t = useTranslations();

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Capabilities")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl max-w-2xl">
            {t("Everything your AI team needs to get training data")}
          </h2>
        </div>

        <div className="grid gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability, index) => (
            <motion.div
              key={capability.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              viewport={{ once: true, margin: "-60px" }}
              className="group flex flex-col items-start"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-gray-50 text-gray-400 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                <capability.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-black mb-3">
                {t(capability.title)}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed max-w-[260px]">
                {t(capability.description)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
