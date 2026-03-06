"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Users, CheckCircle, CreditCard, Sparkles, Shield } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

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
  const t = useTranslations();
  const [role, setRole] = useState<Role>("organizations");

  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-12">
        <div className="mb-6 text-center sm:mb-8">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {t("How it works")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl lg:text-4xl">
            {t("One platform, two seamless experiences")}
          </h2>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">
            {t(
              "Toggle between organizations and contributors to see how each role moves through the Caudals loop.",
            )}
          </p>
        </div>

        <div className="mx-auto mb-6 flex max-w-md items-center gap-1 rounded-full border border-border/80 bg-card p-1 sm:mb-10 sm:gap-2">
          {([
            { id: "organizations", label: "Organizations" },
            { id: "contributors", label: "Contributors" },
          ] as { id: Role; label: string }[]).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRole(option.id)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                role === option.id
                  ? "bg-foreground text-primary-foreground"
                  : "text-slate-500 hover:text-foreground"
              }`}
            >
              {t(option.label)}
            </button>
          ))}
        </div>

        <motion.div
          key={role}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-[1.5rem] border border-border/80 bg-white/90 p-4 sm:rounded-[2rem] sm:p-6 lg:p-8"
        >
          <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
            {t(flows[role].title)}
          </h3>
          <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 md:grid-cols-2">
            {flows[role].steps.map((step, index) => (
              <div key={step.label} className="flex gap-3 rounded-xl border border-border/70 bg-card p-4 sm:gap-4 sm:rounded-2xl sm:p-5">
                <div className="flex h-10 w-10 min-w-[2.5rem] items-center justify-center rounded-lg border border-border/70 bg-accent/15 text-accent sm:h-12 sm:w-12 sm:min-w-[3rem] sm:rounded-[0.8rem]">
                  <step.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-slate-500 sm:text-sm">
                    {t("Step {{index}}", { index: index + 1 })}
                  </p>
                  <h4 className="text-base font-semibold text-foreground sm:text-lg">
                    {t(step.label)}
                  </h4>
                  <p className="text-xs text-slate-500 sm:text-sm">{t(step.description)}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
