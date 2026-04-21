"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Feasibility Study",
    description:
      "Determine whether a dataset can be sourced, built, licensed, and delivered with acceptable risk and expected value before any commitment.",
    price: "$1,000",
    unit: "fixed fee",
    perks: [
      "Feasibility memo and go/no-go recommendation",
      "Source and supplier map",
      "Risk register and rights review",
      "Target schema and quality criteria",
      "Rough build plan with cost range and timeline",
    ],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Pilot Dataset Build",
    description:
      "Build a constrained dataset sample that proves quality, feasibility, and commercial value before a larger commitment.",
    price: "A medida",
    unit: "",
    perks: [
      "5,000–50,000 records in ML-ready format",
      "Schema profiling, cleaning, and deduplication",
      "PII screening and anonymization",
      "Lightweight enrichment or labeling",
      "Recommendation for complete build or stop",
    ],
    cta: "Contact us",
    featured: true,
  },
  {
    name: "Complete Dataset Build",
    description:
      "Deliver a production-grade dataset for buyer use, private offer, catalog listing, or recurring data supply.",
    price: "A medida",
    unit: "",
    perks: [
      "Multi-source sourcing and supplier coordination",
      "Contract, licensing, and rights workflow",
      "Cleaning, anonymization, enrichment, and labeling",
      "Train/validation/test split strategy",
      "Delivery via download, S3, API, or warehouse share",
    ],
    cta: "Contact us",
    featured: false,
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
            {t("Three ways to work with Caudals")}
          </h2>
        </div>

        <div className="grid gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden lg:grid-cols-3 shadow-sm">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="flex flex-col bg-white p-8 sm:p-10"
            >
              <div className="mb-8">
                <h3 className="text-xl font-bold text-black mb-2">
                  {t(plan.name)}
                </h3>
                <p className="min-h-[6.25rem] text-sm leading-relaxed text-gray-500 lg:min-h-[7rem]">
                  {t(plan.description)}
                </p>
              </div>

              <div className="mb-8 min-h-[3.5rem]">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-normal tracking-tight text-black">
                    {t(plan.price)}
                  </span>
                  {plan.unit && (
                    <span className="text-sm text-gray-400">{t(plan.unit)}</span>
                  )}
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
                  plan.featured
                    ? "bg-black text-white hover:bg-black/90"
                    : "border-gray-200 text-black hover:bg-gray-50"
                )}
                asChild
              >
                <Link href="/contact">{t(plan.cta)}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
