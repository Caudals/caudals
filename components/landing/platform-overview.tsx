"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Network, PanelsTopLeft, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

type LayerId = "blueprint" | "contributors" | "quality" | "delivery";

const layers: Record<LayerId, {
  label: string;
  title: string;
  description: string;
  metric: string;
  icon: typeof PanelsTopLeft;
  bullets: string[];
}> = {
  blueprint: {
    label: "Blueprint Studio",
    title: "Guided briefs keep governance and incentives aligned",
    description:
      "Version-controlled templates capture modalities, consent rules, target personas, and payout ladders in minutes.",
    metric: "37% faster time-to-approval",
    icon: PanelsTopLeft,
    bullets: [
      "Region-aware consent + compliance packs",
      "Pricing models + reviewer SLAs in one doc",
      "Auto handoff to contributor ops",
    ],
  },
  contributors: {
    label: "Contributor Pods",
    title: "Certified cohorts with device checks and training",
    description:
      "Spin up regional pods, universities, or your own community. Training flows and device verification keep submissions trustworthy.",
    metric: "52k+ vetted contributors",
    icon: Sparkles,
    bullets: [
      "Role-based enablement + certification",
      "Device + environment attestation",
      "Live ops room for escalations",
    ],
  },
  quality: {
    label: "Quality Lab",
    title: "Multi-reviewer QA, consensus scoring, and re-requests",
    description:
      "Reviewer pods apply checklists, auto flag anomalies, and kick off re-requests before briefs move forward.",
    metric: "95% average acceptance",
    icon: ShieldCheck,
    bullets: [
      "Consensus scoring + rubrics",
      "Adaptive routing for escalations",
      "Slack + email nudges for blockers",
    ],
  },
  delivery: {
    label: "Delivery Rails",
    title: "Instant exports, analytics, and payouts",
    description:
      "Once approved, batches sync to Snowflake, Hugging Face, or your lakehouse while Stripe Connect settles payouts automatically.",
    metric: "<48h to first approved batch",
    icon: Network,
    bullets: [
      "Exports to S3 / GCS / Azure / HF",
      "Spend, quality, and throughput telemetry",
      "Ledger + payout audit trail",
    ],
  },
};

export function PlatformLayersSection() {
  const t = useTranslations();
  const [activeLayer, setActiveLayer] = useState<LayerId>("blueprint");
  const layerEntries = Object.entries(layers) as [LayerId, (typeof layers)[LayerId]][];

  return (
    <section className="py-24 sm:py-32 bg-gray-50/50">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Platform architecture")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("Interactive tooling for every stage of dataset ops")}
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
                    {t("Deep dive into this layer")}
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




