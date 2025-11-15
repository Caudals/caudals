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
  MoreHorizontal,
} from "lucide-react";
import { Inter } from "next/font/google";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const interHeading = Inter({ subsets: ["latin"], weight: ["600", "700"] });

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
            className="inline-flex items-center gap-2 border-border/60 bg-white/70 px-4 py-1.5 text-xs font-medium  text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Supported by leading AI companies
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className={`${interHeading.className} text-balance text-4xl font-extrabold leading-tight text-foreground sm:text-5xl lg:text-6xl`}
        >
          Create enterprise-grade custom datasets with a global network
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
              Browse datasets
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
    { label: "Total earnings", value: "$12,640", note: "From 84 approved submissions" },
    { label: "Pending", value: "5", note: "$420 if approved" },
    { label: "Approval rate", value: "92%", note: "77/84 approved" },
    { label: "Rejected", value: "2", note: "Review notes to improve" },
  ];

  const contributions = [
    {
      dataset: "Industrial robot downtime logs",
      files: "1 file",
      status: "Approved",
      reward: "$0.69",
      submitted: "10/06/2025",
    },
    {
      dataset: "Street images for autonomous driving",
      files: "1 file",
      status: "Pending",
      reward: "$2.50",
      submitted: "10/06/2025",
    },
    {
      dataset: "Healthcare patient anonimized records",
      files: "1 file",
      status: "Approved",
      reward: "$0.69",
      submitted: "10/06/2025",
    },
  ];

  const navLinks = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Browse datasets", icon: Database },
    { label: "My contributions", icon: ListChecks, active: true },
    { label: "Earnings & payouts", icon: Wallet },
    { label: "Settings", icon: Settings },
  ];

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col rounded-[1.2rem] border border-border/70 bg-white/95 p-3 shadow-[0_25px_70px_-40px_rgba(15,23,42,0.55)] sm:p-4 lg:flex-row">
      
      <aside className="hidden w-48 shrink-0 flex-col gap-4 pr-5 text-left text-sm text-muted-foreground lg:flex">
        <div>
          <p className="text-lg font-semibold text-foreground">Dashboard</p>
        </div>
        <nav className="space-y-1">
          {navLinks.map((link) => (
            <button
              key={link.label}
              type="button"
              className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-xs transition-colors ${
                link.active
                  ? "bg-muted text-foreground "
                  : "border border-transparent text-muted-foreground hover:border-border/60 hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <link.icon className="h-3.5 w-3.5" />
                {link.label}
              </span>
              {link.active ? <span className="h-1 w-1 rounded-full bg-foreground" /> : null}
            </button>
          ))}
        </nav>

      </aside>

      <section className="flex-1 space-y-3 text-left sm:space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground sm:text-lg">My contributions</h3>
          </div>
          <button className="self-start rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground sm:self-auto sm:px-4 sm:py-1.5">
            All status
          </button>
        </div>

        <div className="grid gap-2 grid-cols-2 sm:gap-3 lg:grid-cols-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/60 bg-white px-3 py-3 text-left shadow-[0_8px_20px_-14px_rgba(15,23,42,0.35)] sm:rounded-2xl sm:px-4 sm:py-4"
            >
              <p className="text-[10px] font-semibold uppercase text-muted-foreground sm:text-xs">{stat.label}</p>
              <p className="text-xl font-semibold text-foreground sm:text-2xl">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground sm:text-xs">{stat.note}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70 bg-white shadow-[0_10px_30px_-20px_rgba(15,23,42,0.4)] sm:rounded-2xl">
          <div className="flex flex-col gap-2 border-b border-border/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3">
            <div>
              <p className="text-xs text-muted-foreground sm:text-sm">Your submission history across all datasets</p>
            </div>
            <button className="self-start rounded-full border border-border/60 px-2.5 py-0.5 text-[10px] text-muted-foreground sm:self-auto sm:px-3 sm:py-1 sm:text-xs">
              All status
            </button>
          </div>
          
          {/* Desktop Table View */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[2.2fr_repeat(4,1fr)_0.6fr] items-center gap-2 border-b border-border/40 px-5 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
              <span>Dataset</span>
              <span>Files</span>
              <span>Status</span>
              <span>Reward</span>
              <span className="text-right">Submitted</span>
              <span className="text-right">Actions</span>
            </div>
            {contributions.map((entry) => (
              <div
                key={entry.dataset}
                className="grid grid-cols-[2.2fr_repeat(4,1fr)_0.6fr] items-center gap-2 border-b border-border/30 px-5 py-3 text-sm text-foreground last:border-b-0"
              >
                <span className="font-medium text-foreground/90">{entry.dataset}</span>
                <span className="text-muted-foreground">{entry.files}</span>
                <span>
                  <span
                    className={`rounded-full border border-border/50 px-3 py-0.5 text-xs font-medium ${
                      entry.status === "Approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {entry.status}
                  </span>
                </span>
                <span className="text-muted-foreground">{entry.reward}</span>
                <span className="text-right text-muted-foreground">{entry.submitted}</span>
                <span className="flex justify-end text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </span>
              </div>
            ))}
          </div>

          {/* Mobile Card View */}
          <div className="divide-y divide-border/30 lg:hidden">
            {contributions.map((entry) => (
              <div key={entry.dataset} className="space-y-2 px-3 py-3 sm:px-4 sm:py-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-medium text-foreground/90 sm:text-sm">{entry.dataset}</h4>
                  <span
                    className={`shrink-0 rounded-full border border-border/50 px-2 py-0.5 text-[10px] font-medium sm:px-2.5 sm:text-xs ${
                      entry.status === "Approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {entry.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground sm:text-xs">
                  <span>{entry.files}</span>
                  <span className="font-medium text-foreground">{entry.reward}</span>
                  <span>{entry.submitted}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
