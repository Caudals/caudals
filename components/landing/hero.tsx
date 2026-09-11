"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  ClipboardCheck,
  History,
  Layers,
  ListChecks,
  SearchX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroSplineScene } from "@/components/landing/hero-spline-scene";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

/** Splits "text *accent* text" so each locale picks its own serif-italic word. */
function splitAccent(sentence: string) {
  const match = /^(.*?)\*(.+?)\*(.*)$/.exec(sentence);
  return match
    ? { before: match[1], accent: match[2], after: match[3] }
    : { before: sentence, accent: "", after: "" };
}

export function HeroSection() {
  const t = useTranslations();
  const headline = splitAccent(t("We measure AI against what your experts *know*."));

  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center bg-white px-6 pt-16 pb-24 sm:px-8 lg:px-12 lg:pt-24 lg:pb-32">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-85 overflow-hidden">
        <HeroSplineScene />
      </div>

      {/* Bottom gradient fade for smooth transition to the next section */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-48 bg-gradient-to-t from-white to-transparent" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200/80 bg-white/60 px-3.5 py-1.5 text-[13px] font-bold text-teal-700 backdrop-blur-sm"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-600"
          />
          {t("Independent AI evaluation")}
        </motion.p>

        <motion.h1
          aria-label={`${headline.before}${headline.accent}${headline.after}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="mt-8 text-balance text-5xl font-normal tracking-tight text-black sm:text-7xl lg:text-8xl"
        >
          {headline.before}
          {headline.accent ? (
            <span className="font-serif italic text-teal-700/90">{headline.accent}</span>
          ) : null}
          {headline.after}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl"
        >
          {t(
            "The future of AI won't be decided by how much it can answer, but by how often it gets it right. We test your assistant against your own documents and experts, and show you the evidence.",
          )}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="mt-10 flex flex-col items-center gap-4"
        >
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-black px-7 text-base font-bold text-white transition-all hover:scale-[1.02] hover:bg-black/90"
          >
            <Link href="/contact?offer=reality-check">
              {t("Get a free Reality Check")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="max-w-md text-[13px] leading-relaxed text-gray-500">
            {t("Forty questions from your own public documentation, report in 48 hours.")}{" "}
            <Link
              href="/call"
              className="font-medium text-black underline decoration-1 underline-offset-4 hover:text-gray-700"
            >
              {t("Or book a 30-minute call.")}
            </Link>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="mt-16 w-full"
        >
          <HeroPreview />
        </motion.div>
      </div>
    </section>
  );
}

type Verdict = "correct" | "partial" | "wrong";

const verdictStyles: Record<Verdict, { label: string; dot: string; text: string }> = {
  correct: { label: "Correct", dot: "bg-teal-600", text: "text-teal-700" },
  partial: { label: "Partial", dot: "bg-amber-500", text: "text-amber-700" },
  wrong: { label: "Wrong", dot: "bg-red-600", text: "text-red-700" },
};

type PreviewStat = {
  label: string;
  value: string;
  unit?: string;
  basis: string;
  delta?: string;
  tone: "accent" | "danger" | "neutral";
};

const toneStyles: Record<PreviewStat["tone"], { tile: string; value: string }> = {
  accent: { tile: "border-teal-100 bg-teal-50/40", value: "text-teal-800" },
  danger: { tile: "border-red-100 bg-red-50/40", value: "text-red-700" },
  neutral: { tile: "border-gray-100 bg-white/60", value: "text-gray-900" },
};

type PreviewCase = {
  question: string;
  verdict: Verdict;
  critical?: boolean;
  why: string;
  source?: string;
  sourceNote?: string;
};

const caseGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-4 sm:grid-cols-[minmax(0,1.8fr)_0.7fr_1fr] md:grid-cols-[minmax(0,1.7fr)_0.6fr_0.9fr_1fr]";

/** An illustrative scorecard, drawn with the report's own evidence conventions. */
function HeroPreview() {
  const t = useTranslations();

  const navItems = [
    { icon: ClipboardCheck, label: "Scorecard", active: true },
    { icon: ListChecks, label: "Cases" },
    { icon: Layers, label: "Failure causes" },
    { icon: SearchX, label: "Coverage gaps" },
    { icon: History, label: "Runs" },
  ];

  const stats: PreviewStat[] = [
    {
      label: "Correct answers",
      value: "61%",
      basis: "± 8 points · 150 cases",
      delta: "+6 since run 1",
      tone: "accent",
    },
    {
      label: "Critical failures",
      value: "4",
      unit: "of 26",
      basis: "Prices, limits and deadlines",
      tone: "danger",
    },
    {
      label: "Confident but wrong",
      value: "14",
      unit: "cases",
      basis: "No hedging and no source",
      tone: "neutral",
    },
  ];

  const cases: PreviewCase[] = [
    {
      question: "Waiting period for childbirth, Salud Plus",
      verdict: "wrong",
      critical: true,
      why: "Invented answer",
      source: "CG Salud Plus §4.2",
    },
    {
      question: "Dental cover when travelling abroad",
      verdict: "wrong",
      why: "Knowledge gap",
      sourceNote: "Not in your documents",
    },
    {
      question: "Cancelling within 14 days of signing",
      verdict: "partial",
      why: "Retrieval miss",
      source: "CG Salud Plus §9.1",
    },
    {
      question: "Price quote for a 45-year-old",
      verdict: "correct",
      why: "Escalated to an agent",
      sourceNote: "Out of scope",
    },
  ];

  const suiteComposition = [
    { label: "{{count}} everyday", count: 100, width: "w-[67%]", dot: "bg-teal-600/85" },
    { label: "{{count}} critical", count: 26, width: "w-[17%]", dot: "bg-red-500/70" },
    { label: "{{count}} out of scope", count: 24, width: "w-[16%]", dot: "bg-gray-300" },
  ];

  return (
    <div
      role="img"
      aria-label={t("Illustrative example of an evaluation report")}
      className="group relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-200/70 bg-white/85 text-left shadow-[0_48px_120px_-56px_rgba(15,23,42,0.55)] backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between border-b border-gray-100 bg-white/40 px-5 py-3.5">
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            <div className="h-2 w-2 rounded-full bg-gray-200" />
            <div className="h-2 w-2 rounded-full bg-gray-200" />
            <div className="h-2 w-2 rounded-full bg-gray-200" />
          </div>
          <div className="hidden h-3.5 w-px bg-gray-200/80 sm:block" />
          <span className="hidden text-xs text-gray-400 sm:inline">
            {t("Evaluation report")}
          </span>
        </div>
        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
          {t("Illustrative example")}
        </span>
      </div>

      <div className="grid lg:grid-cols-[14rem_1fr]">
        <aside className="hidden border-r border-gray-100 bg-white/30 px-3 py-6 lg:block">
          <div className="px-3 text-[11px] font-medium text-gray-400">{t("Project")}</div>
          <div className="mt-3 space-y-0.5">
            {navItems.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-3 text-[13px]",
                  item.active ? "bg-teal-50/70 text-teal-900" : "text-gray-500",
                )}
              >
                <item.icon
                  className={cn("h-4 w-4", item.active ? "text-teal-700" : "text-gray-400")}
                />
                <span className="font-medium">{t(item.label)}</span>
                {item.active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-600/80" />
                )}
              </div>
            ))}
          </div>

          <div className="mx-1 mt-8 rounded-lg border border-gray-100 bg-gray-50/40 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-gray-500">{t("Suite v3")}</span>
              <span className="text-[11px] tabular-nums text-gray-500">
                {t("{{count}} cases", { count: 150 })}
              </span>
            </div>
            <div className="mt-3 flex h-1 overflow-hidden rounded-full bg-gray-100">
              {suiteComposition.map((tier) => (
                <div key={tier.label} className={cn("h-full", tier.width, tier.dot)} />
              ))}
            </div>
            <div className="mt-3 space-y-1.5 text-[11px] text-gray-500">
              {suiteComposition.map((tier) => (
                <span key={tier.label} className="flex items-center gap-1.5 tabular-nums">
                  <span className={cn("h-1.5 w-1.5 rounded-full", tier.dot)} />
                  {t(tier.label, { count: tier.count })}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-start gap-1">
            <p className="text-base font-medium tracking-tight text-gray-900">
              {t("Customer assistant · Health insurance")}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{t("Run 2 · suite v3")}</p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={cn("rounded-xl border p-5", toneStyles[stat.tone].tile)}
              >
                <div className="text-xs font-medium text-gray-500">{t(stat.label)}</div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "text-[26px] font-normal leading-none tracking-tight tabular-nums",
                      toneStyles[stat.tone].value,
                    )}
                  >
                    {stat.value}
                  </span>
                  {stat.unit ? (
                    <span className="text-sm text-gray-500">{t(stat.unit)}</span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                  {stat.delta ? (
                    <span className="inline-flex items-center gap-1 font-medium text-teal-700">
                      <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
                      {t(stat.delta)}
                    </span>
                  ) : null}
                  <span className="tabular-nums">{t(stat.basis)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <p className="text-sm font-medium tracking-tight text-gray-900">
              {t("Critical failures first")}
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-100 bg-white/50">
              <div
                className={cn(
                  caseGrid,
                  "border-b border-gray-100 bg-gray-50/40 px-5 py-2.5 text-[11px] font-medium text-gray-500",
                )}
              >
                <span>{t("Question")}</span>
                <span>{t("Verdict")}</span>
                <span className="hidden sm:block">{t("Why")}</span>
                <span className="hidden md:block">{t("Source")}</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {cases.map((row) => {
                  const verdict = verdictStyles[row.verdict];
                  return (
                    <li
                      key={row.question}
                      className={cn(
                        caseGrid,
                        "items-center px-5 py-3.5",
                        row.critical && "bg-red-50/40",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-gray-900">
                          {t(row.question)}
                        </span>
                        {row.critical ? (
                          <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-red-700">
                            {t("Critical")}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", verdict.dot)} />
                        <span className={cn("text-[11px] font-bold", verdict.text)}>
                          {t(verdict.label)}
                        </span>
                      </span>
                      <span className="hidden truncate text-[12px] text-gray-500 sm:block">
                        {t(row.why)}
                      </span>
                      <span className="hidden min-w-0 md:block">
                        {row.source ? (
                          <span className="inline-block max-w-full truncate rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                            {row.source}
                          </span>
                        ) : row.sourceNote ? (
                          <span className="text-[11px] text-gray-400">{t(row.sourceNote)}</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
