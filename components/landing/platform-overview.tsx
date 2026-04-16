"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Search, ShieldCheck, Package, ArrowRight } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

type LayerId = "intake" | "sourcing" | "processing" | "delivery";

const layers: Record<LayerId, {
  label: string;
  title: string;
  description: string;
  metric: string;
  icon: typeof Upload;
  bullets: string[];
}> = {
  intake: {
    label: "Data Intake",
    title: "Companies upload their raw data to Caudals",
    description:
      "Supplier companies connect their data sources or upload files directly. We handle schema detection, initial validation, and secure storage.",
    metric: "Onboard in under 24 hours",
    icon: Upload,
    bullets: [
      "Drag-and-drop or API-based ingestion",
      "Automatic schema detection + validation",
      "Secure encrypted storage on upload",
    ],
  },
  sourcing: {
    label: "Data Sourcing",
    title: "We find and aggregate data from multiple sources",
    description:
      "When a buyer needs a specific dataset, our team contacts relevant companies, negotiates access, and combines data from multiple suppliers with publicly available sources.",
    metric: "Cross-industry sourcing network",
    icon: Search,
    bullets: [
      "Multi-supplier aggregation for richer datasets",
      "Public data enrichment from open sources",
      "Licensing negotiation handled by us",
    ],
  },
  processing: {
    label: "Processing & QA",
    title: "Automated cleaning, anonymization, and quality scoring",
    description:
      "Every dataset passes through our processing pipeline: PII removal, format standardization, deduplication, and quality scoring before reaching the catalog.",
    metric: "98%+ quality scores on delivered data",
    icon: ShieldCheck,
    bullets: [
      "PII detection and anonymization",
      "Format conversion to Parquet / JSON-Lines",
      "Automated + manual quality validation",
    ],
  },
  delivery: {
    label: "Delivery & Billing",
    title: "Buyers access datasets through the catalog or API",
    description:
      "Processed datasets are published in our catalog with full metadata, sample previews, and quality scores. Buyers purchase access and download via signed URLs or API.",
    metric: "API access + bulk downloads",
    icon: Package,
    bullets: [
      "Dataset cards with schema, samples, and scores",
      "Signed download URLs or S3-compatible API",
      "Revenue share auto-settled to suppliers",
    ],
  },
};

export function PlatformLayersSection() {
  const t = useTranslations();
  const [activeLayer, setActiveLayer] = useState<LayerId>("intake");
  const layerEntries = Object.entries(layers) as [LayerId, (typeof layers)[LayerId]][];

  return (
    <section className="py-24 sm:py-32 bg-gray-50/50">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("How it works")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("From raw company data to ML-ready datasets")}
          </h2>
        </div>

        <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] items-start">
          <div className="flex flex-col gap-2">
            {layerEntries.map(([id, layer]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveLayer(id)}
                className={cn(
                  "group relative flex flex-col items-start rounded-xl p-5 text-left transition-all",
                  activeLayer === id
                    ? "bg-white shadow-sm ring-1 ring-gray-200"
                    : "hover:bg-white/50"
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                    activeLayer === id ? "bg-teal-50 text-teal-600" : "bg-gray-100 text-gray-400 group-hover:bg-white group-hover:text-gray-600"
                  )}>
                    <layer.icon className="h-4 w-4" />
                  </div>
                  <span className={cn(
                    "text-sm font-bold transition-colors",
                    activeLayer === id ? "text-black" : "text-gray-400 group-hover:text-gray-600"
                  )}>
                    {t(layer.label)}
                  </span>
                </div>
                <span className={cn(
                  "text-[11px] font-bold transition-colors",
                  activeLayer === id ? "text-teal-600" : "text-gray-400 group-hover:text-gray-500"
                )}>
                  {t(layer.metric)}
                </span>
                {activeLayer === id && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute left-0 top-1/4 h-1/2 w-1 bg-teal-500 rounded-sm"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="relative min-h-[400px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeLayer}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="bg-white rounded-xl border border-gray-100 p-8 sm:p-12 shadow-sm"
              >
                <div className="inline-flex items-center gap-2 rounded-md bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-700 mb-8">
                  {t(layers[activeLayer].label)}
                </div>
                <h3 className="text-3xl font-normal tracking-tight text-black mb-6 leading-tight">
                  {t(layers[activeLayer].title)}
                </h3>
                <p className="text-lg text-gray-500 mb-10 leading-relaxed">
                  {t(layers[activeLayer].description)}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {layers[activeLayer].bullets.map((bullet) => (
                    <div key={bullet} className="flex items-center gap-3">
                      <div className="h-1 w-1 rounded-sm bg-teal-500" />
                      <span className="text-sm font-bold text-gray-700">{t(bullet)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-12 pt-8 border-t border-gray-50">
                  <Link href="/contact" className="inline-flex items-center gap-2 text-sm font-bold text-black group">
                    {t("Learn more about this step")}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
