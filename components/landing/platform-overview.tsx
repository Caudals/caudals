"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Network, PanelsTopLeft, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

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
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {t("Caudals operating layers")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
            {t("Interactive tooling for every stage of dataset ops")}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {t(
              "Switch between the layers to see how briefs move from planning to contributor pods, quality loops, and delivery rails.",
            )}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            {layerEntries.map(([id, layer]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveLayer(id)}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-colors ${
                  activeLayer === id
                    ? "border-border bg-muted/60 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-3 ">
                  <div className="flex h-10 w-10 min-w-[2.5rem] items-center justify-center rounded-md bg-muted/15 text-accent">
                  <layer.icon className="h-5 w-5 " />
                  </div>
                  <span className="text-base font-semibold">{t(layer.label)}</span>
                </div>
                <span className="text-xs uppercase">{t(layer.metric)}</span>
              </button>
            ))}
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-card p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeLayer}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
                className="space-y-5"
              >
                <p className="text-sm font-semibold uppercase text-muted-foreground">
                  {t(layers[activeLayer].label)}
                </p>
                <h3 className="text-2xl font-semibold text-foreground">
                  {t(layers[activeLayer].title)}
                </h3>
                <p className="text-base text-muted-foreground">
                  {t(layers[activeLayer].description)}
                </p>
                <ul className="grid gap-3 text-sm text-muted-foreground">
                  {layers[activeLayer].bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <span className="mt-1 inline-flex h-1.5 w-1.5 rounded-full bg-muted" />
                      {t(bullet)}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}




