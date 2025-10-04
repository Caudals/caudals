"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, FileImage, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const featureCards = [
  {
    icon: <FileImage className="h-5 w-5 text-primary" aria-hidden="true" />,
    title: "Flexible task briefs",
    description:
      "Define modalities, formats, compliance, and consent in structured templates.",
  },
  {
    icon: <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />,
    title: "Programmatic approvals",
    description:
      "Review submissions with versioned feedback, checklists, and automated QA hooks.",
  },
  {
    icon: <Zap className="h-5 w-5 text-primary" aria-hidden="true" />,
    title: "Payout automation",
    description:
      "Stripe Connect handles contributor payouts and platform commissions when you approve.",
  },
];

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden rounded-[3rem] border border-border bg-white/90 px-8 py-16 shadow-soft-lg backdrop-blur-xl sm:px-12 lg:px-20">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center gap-8 text-center lg:items-start lg:text-left"
      >
        <Badge
          variant="outline"
          className="border-primary/20 bg-primary/5 text-primary"
        >
          Built for data teams, loved by contributors
        </Badge>
        <div className="space-y-6">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Crowdsource rich, real-world datasets—at scale.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Post precise collection tasks. Contributors upload compliant data.
            You review, approve, and pay—effortlessly. Discover a new way to
            build production-grade datasets.
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button size="lg" asChild className="min-w-[200px]">
            <Link href="/dashboard/requests/new">
              Post a dataset request
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="min-w-[200px] border-muted bg-white/80 shadow-sm"
          >
            <Link href="/browse">Start contributing</Link>
          </Button>
        </div>
        <div className="grid w-full gap-6 text-left sm:grid-cols-3">
          {featureCards.map(({ icon, title, description }) => (
            <Card
              key={title}
              className="border-muted/70 bg-white/80 shadow-soft-md"
            >
              <CardContent className="space-y-3 px-5 py-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                  {icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="gradient-mask absolute inset-0 bg-oa-radial opacity-70" />
        <div className="absolute left-1/2 top-0 h-[240px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      </div>
    </section>
  );
}
