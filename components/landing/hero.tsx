"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  LayoutDashboard,
  Database,
  ListChecks,
  Wallet,
  Settings,
} from "lucide-react";
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
  const statCards = [
    { label: "Total earnings", value: "$12,640", note: "From 84 approved submissions", accent: "text-emerald-600" },
    { label: "Pending", value: "5", note: "$420 if approved", accent: "text-sky-600" },
    { label: "Approval rate", value: "92%", note: "77/84 approved", accent: "text-amber-600" },
    { label: "Rejected", value: "2", note: "Review feedback to improve", accent: "text-rose-600" },
  ];

  const contributions = [
    {
      dataset: "Aerial mapping cues for drones",
      files: "18 files",
      status: "approved",
      reward: "$680",
      submitted: "10/06/2025",
    },
    {
      dataset: "Safety prompts for multilingual agents",
      files: "12 files",
      status: "pending",
      reward: "$420",
      submitted: "10/04/2025",
    },
  ];

  const sidebarLinks = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Browse datasets", icon: Database },
    { label: "My contributions", icon: ListChecks, active: true },
    { label: "Earnings & payouts", icon: Wallet },
    { label: "Settings", icon: Settings },
  ];

  const statusStyles: Record<string, string> = {
    approved: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    rejected: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="relative mx-auto max-w-5xl rounded-[2.4rem] border border-border/70 bg-card/95 p-6 shadow-[0_45px_140px_-80px_rgba(11,12,17,0.6)] backdrop-blur">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="flex w-full max-w-xs flex-col rounded-[1.6rem] border border-border/60 bg-white p-6">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Caudals</p>
            <p className="text-lg font-semibold text-foreground">Contributor dashboard</p>
            <div className="mt-3 rounded-xl border border-border/70 bg-muted px-3 py-2 text-sm text-foreground">
              Contributor view
            </div>
          </div>
          <div className="space-y-2">
            {sidebarLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  link.active
                    ? "border border-foreground bg-white text-foreground"
                    : "border border-transparent text-muted-foreground hover:border-border/70 hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-3">
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </span>
                {link.active ? <span className="h-1.5 w-1.5 rounded-full bg-foreground" /> : null}
              </button>
            ))}
          </div>
          <div className="mt-auto rounded-2xl border border-border/80 bg-muted/40 p-4 text-sm">
            <p className="font-semibold text-foreground">Maya Cooper</p>
            <p className="text-xs text-muted-foreground">maya@caudals.community</p>
            <div className="mt-3 rounded-xl border border-border/70 bg-white px-3 py-2 text-xs">
              Contributor ID · CC-4820
            </div>
          </div>
        </aside>

        <section className="flex-1 rounded-[1.6rem] border border-border/70 bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Dashboard / Contributions</p>
              <h3 className="text-2xl font-semibold text-foreground">My contributions</h3>
            </div>
            <Button variant="outline" className="h-9 rounded-full border-border/70 px-4 text-sm">
              All status
            </Button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-border/80 bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className={`mt-2 text-2xl font-semibold ${card.accent}`}>{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-border/70">
            <div className="grid grid-cols-[2fr_repeat(4,1fr)] gap-2 border-b border-border/70 px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">
              <span>Dataset</span>
              <span>Files</span>
              <span>Status</span>
              <span>Reward</span>
              <span className="text-right">Submitted</span>
            </div>
            {contributions.map((entry) => (
              <div
                key={entry.dataset}
                className="grid grid-cols-[2fr_repeat(4,1fr)] items-center gap-2 border-b border-border/40 px-6 py-4 text-sm text-foreground last:border-b-0"
              >
                <span className="font-medium text-foreground/90">{entry.dataset}</span>
                <span className="text-muted-foreground">{entry.files}</span>
                <span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[entry.status]}`}>
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </span>
                </span>
                <span className="text-muted-foreground">{entry.reward}</span>
                <span className="text-right text-muted-foreground">{entry.submitted}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
