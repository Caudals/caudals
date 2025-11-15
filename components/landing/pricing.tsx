"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type BillingMode = "project" | "retainer";

const plans = [
  {
    name: "Launch",
    description:
      "For teams kicking off a single modality or pilot program with guided support and curated contributors.",
    highlight: "Getting started",
    projectPrice: "from $1.2 / approved submission",
    retainerPrice: "$4,500 / month",
    perks: [
      "Dataset blueprint + governance checklist",
      "Curated contributor pod & training toolkits",
      "Reviewer workspace with consensus scoring",
      "Stripe Connect payouts & compliance",
      "Email + async support",
    ],
    cta: "Book a blueprint call",
  },
  {
    name: "Scale",
    description:
      "Designed for companies running multiple modalities, custom tutorials, and regional contributor cohorts.",
    highlight: "Most popular",
    projectPrice: "custom per modality & volume",
    retainerPrice: "$9,900 / month",
    perks: [
      "Dedicated success manager & QA lead",
      "Contributor certification & requalification",
      "Custom tutorials + branded contributor portal",
      "Slack support with 4-hour SLA",
      "Insights reporting & quarterly roadmap reviews",
    ],
    cta: "Talk to our team",
  },
  {
    name: "Enterprise",
    description:
      "Bespoke engagements with architecture co-design, promotional placement, and private deployments.",
    highlight: "Bespoke",
    projectPrice: "co-designed engagement (quote)",
    retainerPrice: "from $22k / month (annual)",
    perks: [
      "Embedded data ops pod & solution architects",
      "Dataset design + AI architecture consulting",
      "Private or regional deployments (VPC/on-prem)",
      "Featured marketplace placement & ads",
      "Executive reviews + procurement support",
    ],
    cta: "Plan an executive session",
  },
];

export function PricingSection() {
  const [billingMode, setBillingMode] = useState<BillingMode>("project");

  return (
    <section id="pricing" className="relative py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,_rgba(52,97,255,0.08),transparent_70%)]" />
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 sm:px-8 lg:px-12">
        <div className="text-center">
          <Badge className="border-black/10 bg-[#7f8cff]/15 text-[#7f8cff]">
            Pricing made for dataset velocity
          </Badge>
          <h2 className="mt-6 text-3xl font-semibold text-foreground sm:text-4xl">
            Custom plans for ML teams, research labs, and enterprise partners
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-base text-muted-foreground">
            Mix project-based briefs when you need a focused sprint or retain an embedded Caudals pod
            for managed operations. All plans bill only on approved submissions.
          </p>
        </div>

        <div className="mx-auto flex items-center gap-3 rounded-full border border-black/15 bg-white/70 p-1 text-sm text-muted-foreground shadow-sm backdrop-blur">
          <BillingToggle
            label="Per project"
            active={billingMode === "project"}
            onClick={() => setBillingMode("project")}
          />
          <BillingToggle
            label="Retainer"
            active={billingMode === "retainer"}
            onClick={() => setBillingMode("retainer")}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true, margin: "-60px" }}
              className="flex h-full flex-col gap-6 rounded-[1.8rem] border border-black/10 bg-white/80 p-8 shadow-[0_32px_80px_-38px_rgba(15,15,15,0.28)] backdrop-blur-xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-foreground">{plan.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <Badge variant="outline" className="border-black/10 bg-white/70 text-muted-foreground">
                  {plan.highlight}
                </Badge>
              </div>
              <div className="space-y-2 rounded-2xl border border-white/60 bg-white/70 p-4 text-left shadow-xs backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {billingMode === "project" ? "Per project" : "Retainer"}
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {billingMode === "project" ? plan.projectPrice : plan.retainerPrice}
                </p>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full border border-black/15 bg-secondary/15 text-secondary">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-3">
                <Button className="h-11" size="lg">
                  {plan.cta}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
                {plan.name === "Enterprise" ? (
                  <div className="flex items-center gap-2 rounded-xl border border-black/15 bg-white/60 px-4 py-3 text-xs text-muted-foreground backdrop-blur">
                    <Sparkles className="h-4 w-4 text-[#7f8cff]" />
                    Includes architecture co-design, featured marketplace placement, and ads.
                  </div>
                ) : null}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="rounded-[1.6rem] border border-dashed border-black/15 bg-white/40 px-6 py-5 text-center text-sm text-muted-foreground backdrop-blur">
          Add-ons: dataset bootcamps for your contributors, private Slack channels, or promotional
          placement for requests in the browse feed. Mention them during your intro call.
        </div>
      </div>
    </section>
  );
}

interface BillingToggleProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function BillingToggle({ label, active, onClick }: BillingToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 transition-colors ${
        active
          ? "bg-black text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
