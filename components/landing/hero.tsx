"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const heroHighlights = [
  "No onboarding fees",
  "Pay only for approvals",
  "Human QA included",
];

export function HeroSection() {
  return (
    <section className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16 sm:px-8 lg:px-12">
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <Badge
            variant="outline"
            className="inline-flex items-center gap-2 border-border/60 bg-white/70 px-4 py-1.5 text-xs font-medium uppercase text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Launch confident data programs
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="text-balance text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          Run contributor-powered datasets with enterprise control
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          Caudals links your ML team with certified contributors, reviewer pods, and automated
          payouts so every dataset sprint ships faster without compromising compliance or
          governance.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-10 flex flex-col gap-4 sm:flex-row"
        >
          <Button size="lg" className="h-12 min-w-[200px] px-8 text-base" asChild>
            <Link href="/dashboard/requests/new">Start a project</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 min-w-[200px] border-border/80 text-base"
            asChild
          >
            <Link href="/browse">
              Browse live briefs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground"
        >
          {heroHighlights.map((highlight) => (
            <div key={highlight} className="flex items-center gap-2 text-foreground/70">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              {highlight}
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-14 w-full"
        >
          <HeroPreview />
        </motion.div>
      </div>
    </section>
  );
}

function HeroPreview() {
  const metrics = [
    { label: "Certified contributors", value: "52,487", change: "+412 this week" },
    { label: "Approved submissions", value: "12.4M", change: "95% quality score" },
    { label: "Avg. payout", value: "$36", change: "per accepted task" },
  ];

  const briefs = [
    {
      title: "Multilingual safety prompts",
      modality: "NLP · 6 regions",
      status: "In review",
      progress: 72,
    },
    {
      title: "Smart camera gestures",
      modality: "Vision · wearables",
      status: "Collecting",
      progress: 44,
    },
    {
      title: "Synthetic sensor fusion",
      modality: "Robotics",
      status: "QA ready",
      progress: 88,
    },
  ];

  return (
    <div className="relative mx-auto max-w-4xl rounded-[2.4rem] border border-border/70 bg-card/95 p-6 shadow-[0_45px_140px_-80px_rgba(11,12,17,0.6)] backdrop-blur">
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-border/80 bg-white p-4 text-left">
            <p className="text-xs uppercase text-muted-foreground">{metric.label}</p>
            <p className="mt-3 text-2xl font-semibold text-foreground">{metric.value}</p>
            <p className="text-xs text-muted-foreground">{metric.change}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-border/80 bg-white p-5 text-left">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Live dataset briefs</p>
            <p className="text-xs text-muted-foreground">Auto-syncs with contributor pods + QA</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">Auto payouts · Stripe</span>
        </div>
        <div className="mt-4 space-y-3">
          {briefs.map((brief) => (
            <div
              key={brief.title}
              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-secondary/70 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{brief.title}</p>
                <p className="text-xs text-muted-foreground">{brief.modality}</p>
              </div>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 text-foreground/80">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  {brief.status}
                </span>
                <div className="h-1.5 w-full rounded-full bg-border">
                  <div
                    className="h-1.5 rounded-full bg-foreground"
                    style={{ width: `${brief.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
