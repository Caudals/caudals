"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Catalog",
    description:
      "Access pre-processed datasets from our growing catalog.",
    price: "From $500",
    unit: "/dataset",
    perks: [
      "Browse available datasets",
      "Quality scores and previews",
      "Standard ML-ready formats",
      "Signed download URLs",
      "Email support",
    ],
    cta: "Browse catalog",
  },
  {
    name: "Custom",
    description:
      "We source and build the exact dataset your team needs.",
    price: "From $2,000",
    unit: "/project",
    perks: [
      "Multi-source data aggregation",
      "Custom cleaning and formatting",
      "Dedicated project manager",
      "Delivery in under 2 weeks",
      "Priority support",
    ],
    cta: "Request a dataset",
    featured: true,
  },
  {
    name: "Enterprise",
    description:
      "Ongoing data supply for teams with recurring needs.",
    price: "Custom",
    unit: "",
    perks: [
      "API access to full catalog",
      "Recurring data feeds",
      "Exclusive sourcing agreements",
      "SLA-backed delivery",
      "Dedicated account team",
    ],
    cta: "Talk to sales",
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
            {t("Simple pricing for data buyers and suppliers")}
          </h2>
          <p className="text-base text-gray-500 mt-6 leading-relaxed">
            {t("Data suppliers list for free and earn revenue share on every sale.")}
          </p>
        </div>

        <div className="grid gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden lg:grid-cols-3 mb-12 shadow-sm">
          {plans.map((plan) => (
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
                  {plan.unit && <span className="text-sm text-gray-400">{t(plan.unit)}</span>}
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
            "Want to sell your company's data? Suppliers list for free. We handle processing, licensing, and buyer acquisition. You earn 60-70% revenue share on every sale.",
          )}
        </p>
      </div>
    </section>
  );
}
