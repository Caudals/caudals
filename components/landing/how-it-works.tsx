"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Users, CheckCircle, CreditCard, Sparkles, Shield } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

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
    <section className="py-24 sm:py-32 bg-white overflow-hidden">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12 text-center">
        <div className="flex flex-col items-center justify-center gap-8 mb-16 mx-auto max-w-3xl">
          <div>
            <p className="text-[13px] font-bold text-teal-600 mb-4">
              {t("Operations")}
            </p>
            <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
              {t("One platform, two seamless experiences")}
            </h2>
          </div>
          
          <div className="flex p-1 bg-gray-100 rounded-lg h-11 w-full max-w-[320px]">
            {([
              { id: "organizations", label: "Organizations" },
              { id: "contributors", label: "Contributors" },
            ] as { id: Role; label: string }[]).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRole(option.id)}
                className={cn(
                  "flex-1 rounded-md text-xs font-bold transition-all",
                  role === option.id
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={role}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <h3 className="text-2xl font-bold text-black mb-10 text-center">
              {t(flows[role].title)}
            </h3>
            
            <div className="grid gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden sm:grid-cols-2 lg:grid-cols-4 text-left">
              {flows[role].steps.map((step, index) => (
                <div key={step.label} className="bg-white p-8 flex flex-col items-start group hover:bg-gray-50/50 transition-colors">
                  <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-600 transition-transform group-hover:scale-110">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <p className="text-[10px] font-bold text-teal-600 mb-2">
                    {t("Phase 0{{index}}", { index: index + 1 })}
                  </p>
                  <h4 className="text-lg font-bold text-black mb-3">
                    {t(step.label)}
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {t(step.description)}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
