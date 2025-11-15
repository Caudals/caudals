"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Users, CheckCircle, CreditCard, Sparkles, Shield } from "lucide-react";

type Role = "organizations" | "contributors";

const flows: Record<Role, {
  title: string;
  steps: { label: string; description: string; icon: typeof ClipboardList }[];
}> = {
  organizations: {
    title: "How ML teams work on Caudals",
    steps: [
      {
        label: "Post a blueprint",
        description:
          "Define modalities, acceptance criteria, payouts, and compliance guardrails with the blueprint wizard.",
        icon: ClipboardList,
      },
      {
        label: "Match or invite contributors",
        description:
          "Auto-match certified pods or bring your own community. Training and device checks run instantly.",
        icon: Users,
      },
      {
        label: "Review with QA pods",
        description:
          "Reviewer cohorts apply rubrics, request resubmits, and keep a full audit trail before approvals.",
        icon: CheckCircle,
      },
      {
        label: "Export + payout",
        description:
          "Approved batches sync to your stack while Stripe Connect issues payments and ledger exports.",
        icon: CreditCard,
      },
    ],
  },
  contributors: {
    title: "How contributors experience Caudals",
    steps: [
      {
        label: "Complete enablement",
        description:
          "Access training flows, device verification, and sample tasks before unlocking live briefs.",
        icon: Sparkles,
      },
      {
        label: "Claim briefs",
        description:
          "Browse sponsored or public opportunities, filter by payout, modality, or device requirements.",
        icon: ClipboardList,
      },
      {
        label: "Submit + iterate",
        description:
          "Follow playbooks, resubmit if QA requests edits, and track acceptance status in real time.",
        icon: Shield,
      },
      {
        label: "Instant payouts",
        description:
          "Stripe Connect settles funds once submissions clear QA with full earnings history and receipts.",
        icon: CreditCard,
      },
    ],
  },
};

export function HowItWorksSection() {
  const [role, setRole] = useState<Role>("organizations");

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
            One platform, two seamless experiences
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Toggle between organizations and contributors to see how each role moves through the Caudals loop.
          </p>
        </div>

        <div className="mx-auto mb-10 flex max-w-md items-center gap-2 rounded-full border border-border/80 bg-card p-1">
          {([
            { id: "organizations", label: "Organizations" },
            { id: "contributors", label: "Contributors" },
          ] as { id: Role; label: string }[]).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRole(option.id)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                role === option.id
                  ? "bg-foreground text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <motion.div
          key={role}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-[2rem] border border-border/80 bg-white/90 p-6"
        >
          <h3 className="text-2xl font-semibold text-foreground">{flows[role].title}</h3>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {flows[role].steps.map((step, index) => (
              <div key={step.label} className="flex gap-4 rounded-2xl border border-border/70 bg-card p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-foreground">
                  <step.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase text-muted-foreground">Step {index + 1}</p>
                  <h4 className="text-lg font-semibold text-foreground">{step.label}</h4>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
