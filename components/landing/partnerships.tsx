"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Flame, Globe2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";

const highlights = [
  {
    icon: Target,
    title: "Blueprint sprints",
    description:
      "Co-design dataset specs, contributor personas, and QA protocols with Caudals Labs in ten focused days.",
  },
  {
    icon: Globe2,
    title: "Custom cohorts",
    description:
      "Spin up regional contributor pods or university partnerships with live enablement and certification.",
  },
  {
    icon: Flame,
    title: "Signal amplification",
    description:
      "Feature your briefs, run paid campaigns, and place sponsored requests at the top of the browse feed.",
  },
];

const partnershipMetrics = [
  { label: "Blueprint to launch", value: "10 days" },
  { label: "Sponsored brief CTR", value: "↑ 2.8x" },
  { label: "University pods", value: "36 campuses" },
];

export function PartnershipsSection() {
  const t = useTranslations();

  return (
    <section id="partnerships" className="py-20">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_minmax(0,0.9fr)] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            viewport={{ once: true, margin: "-80px" }}
            className="rounded-[2.25rem] border border-border/80 bg-card p-10"
          >
            <div className="flex flex-col gap-6">
              <div className="space-y-3 text-left">
                <p className="text-xs font-semibold uppercase text-accent">
                  {t("Partnerships")}
                </p>
                <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
                  {t(
                    "Partner with Caudals to co-design research programs, educational cohorts, or strategic distribution alliances",
                  )}
                </h2>
                <p className="text-base leading-relaxed text-slate-500">
                  {t(
                    "Unlock a dedicated Caudals Labs pod to architect bespoke datasets, energize your contributor community, or co-brand initiatives with universities and enterprises. We compress months of planning into a single aligned track.",
                  )}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {partnershipMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-border/70 bg-white p-4 text-left"
                  >
                    <p className="text-xs uppercase text-slate-500">{t(metric.label)}</p>
                    <p className="text-lg font-semibold text-foreground">{t(metric.value)}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Button size="lg" asChild className="h-12 px-6">
                  <Link href="/collaborate">
                    {t("Explore partnerships")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-4">
            {highlights.map((highlight, index) => (
              <motion.div
                key={highlight.title}
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                viewport={{ once: true, margin: "-70px" }}
                className="group flex items-start gap-4 rounded-2xl border border-border/80 bg-white p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <highlight.icon className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">{t(highlight.title)}</h3>
                  <p className="text-sm leading-relaxed text-slate-500">
                    {t(highlight.description)}
                  </p>
                </div>
              </motion.div>
            ))}
            <div className="rounded-2xl border border-dashed border-border/80 bg-card p-5 text-sm text-slate-500">
              <p>
                {t(
                  "Partnerships turn your briefs into sponsored placements, curriculum-aligned cohorts, and co-branded activations. Loop in universities, research labs, or internal communities and we'll run the playbook end-to-end.",
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}




