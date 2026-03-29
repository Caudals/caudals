"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Launch",
    description:
      "For teams kicking off a single modality or pilot program.",
    price: "$4,500",
    perks: [
      "Dataset blueprint + governance",
      "Curated contributor pods",
      "Reviewer workspace",
      "Stripe Connect payouts",
      "Email + async support",
    ],
    cta: "Book a blueprint call",
  },
  {
    name: "Scale",
    description:
      "For companies running multiple modalities and cohorts.",
    price: "$9,900",
    perks: [
      "Dedicated success manager",
      "Contributor certification",
      "Custom tutorials + portal",
      "Slack support (4h SLA)",
      "Insights reporting",
    ],
    cta: "Talk to our team",
    featured: true,
  },
  {
    name: "Enterprise",
    description:
      "Bespoke engagements with private deployments.",
    price: "Custom",
    perks: [
      "Embedded data ops pod",
      "Dataset design consulting",
      "VPC / On-prem deployments",
      "Featured marketplace ads",
      "Executive reviews",
    ],
    cta: "Plan a session",
  },
];

export function PricingSection() {
  const t = useTranslations();

  return (
    <section id="pricing" className="py-24 sm:py-32 bg-gray-50/50">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Pricing")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl leading-tight">
            {t("Plans for ML teams, research labs, and enterprise partners")}
          </h2>
        </div>

        <div className="grid gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden lg:grid-cols-3 mb-12 shadow-sm">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className="flex flex-col bg-white p-8 sm:p-10"
            >
              <div className="mb-8">
                <h3 className="text-xl font-bold text-black mb-2">
                  {t(plan.name)}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {t(plan.description)}
                </p>
              </div>
              
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-normal tracking-tight text-black">{t(plan.price)}</span>
                  {plan.price !== "Custom" && <span className="text-sm text-gray-400">/mo</span>}
                </div>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                    <span className="text-sm text-gray-600">{t(perk)}</span>
                  </li>
                ))}
              </ul>

              <Button 
                variant={plan.featured ? "default" : "outline"}
                className={cn(
                  "h-11 w-full rounded-md text-sm font-bold transition-all",
                  plan.featured ? "bg-black text-white hover:bg-black/90" : "border-gray-200 text-black hover:bg-gray-50"
                )}
                asChild
              >
                <Link href="/contact">
                  {t(plan.cta)}
                </Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 max-w-2xl mx-auto leading-relaxed">
          {t(
            "Add-ons: dataset bootcamps, private Slack channels, or promotional placement. Mention them during your intro call.",
          )}
        </p>
      </div>
    </section>
  );
}
