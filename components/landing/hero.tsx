"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const proofPoints = [
  { label: "Active contributors", value: "50K+", sublabel: "human-reviewed profiles" },
  { label: "Launch speed", value: "48 hrs", sublabel: "average to first batch" },
  { label: "Collection quality", value: "95%", sublabel: "avg. approval rate" },
];

const workflowCards = [
  {
    title: "Human-in-the-loop QA",
    description: "Layer consensus checks, reviewer rubrics, and automatic rejection logic.",
  },
  {
    title: "Regional pods",
    description: "Spin up targeted contributor pods across 120+ countries in hours.",
  },
  {
    title: "Responsible data rails",
    description: "Consent tracking, compliance exports, and policy templates built-in.",
  },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 py-20 sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-primary/5 blur-[140px]" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-8 text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-3 text-sm text-muted-foreground lg:justify-start"
          >
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 px-4 py-1.5 text-primary"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Responsible data creation network
            </Badge>
            <span className="hidden text-xs font-medium uppercase tracking-[0.3em] text-primary/90 sm:inline-block">
              Since 2021
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-4xl font-semibold leading-tight tracking-tight text-transparent sm:text-5xl lg:text-6xl"
          >
            Build trustworthy datasets with a global partnerships engine
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            Caudals unites responsible data practices, contributor operations, and payout
            automation so your team can design ambitious collection programs faster than
            ever—without compromising on diversity or compliance.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col gap-4 sm:flex-row sm:items-center"
          >
            <Button size="lg" className="h-12 w-full px-8 text-base sm:w-auto" asChild>
              <Link href="/dashboard/requests/new">Launch a request</Link>
            </Button>
            <Button
              size="lg"
              className="h-12 w-full px-8 text-base hover:bg-transparent hover:text-primary/80 sm:w-auto"
              asChild
              variant="ghost"
            >
              <Link href="/browse">
                Browse opportunities
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid gap-4 rounded-3xl border border-border/80 bg-white/80 p-5 shadow-md backdrop-blur-sm sm:grid-cols-3"
          >
            {proofPoints.map((point) => (
              <div key={point.label} className="space-y-1 text-left">
                <p className="text-2xl font-semibold text-slate-900">{point.value}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">
                  {point.label}
                </p>
                <p className="text-xs text-muted-foreground">{point.sublabel}</p>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative"
        >
          <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-slate-100 via-white to-slate-50 blur-xl" />
          <div className="relative space-y-4 rounded-[3rem] border border-border/50 bg-white/70 p-6 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">Program health</p>
                <p className="text-xs text-muted-foreground">Live monitoring</p>
              </div>
              <span className="text-2xl font-bold text-primary">97%</span>
            </div>
            <div className="space-y-3 rounded-2xl border border-border/70 bg-white/80 p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Workflow spotlight</p>
              <p className="text-sm text-muted-foreground">
                Curate specialized contributor groups, deliver micro-learning modules, and
                approve payouts without leaving the dashboard.
              </p>
            </div>
            <div className="space-y-3 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/5 to-primary/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                Modular workflows
              </p>
              <div className="grid gap-3">
                {workflowCards.map((card) => (
                  <div
                    key={card.title}
                    className="rounded-2xl border border-white/60 bg-white/80 p-3 text-left shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                    <p className="text-xs text-muted-foreground">{card.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
