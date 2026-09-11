"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import {
  getEvaluationOffer,
  type EvaluationOfferId,
} from "@/lib/public/evaluation-offers";
import { cn } from "@/lib/utils";

const plans: { id: EvaluationOfferId; cta: string; featured: boolean }[] = [
  { id: "reality-check", cta: "Request a Reality Check", featured: false },
  { id: "pilot-evaluation", cta: "Start a pilot", featured: true },
  { id: "monthly-subscription", cta: "Ask about the subscription", featured: false },
];

const additionalOfferIds: EvaluationOfferId[] = ["full-evaluation", "dataset-build"];

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
            {t("Fixed prices. Never by the hour.")}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-gray-500">
            {t("Start free. Every paid offer has a fixed scope, a fixed price and a date.")}
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm">
          <div className="grid gap-px lg:grid-cols-3">
            {plans.map((plan) => {
              const offer = getEvaluationOffer(plan.id);
              return (
                <div key={offer.id} className="flex flex-col bg-white p-8 sm:p-10">
                  <div className="mb-8">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-xl font-bold text-black">{t(offer.name)}</h3>
                      <span className="shrink-0 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-500">
                        {t(offer.duration)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-gray-500 lg:min-h-[6.5rem]">
                      {t(offer.summary)}
                    </p>
                  </div>

                  <div className="mb-8 flex items-baseline gap-2">
                    <span className="text-3xl font-normal tracking-tight text-black tabular-nums">
                      {t(offer.price)}
                    </span>
                    {offer.priceUnit ? (
                      <span className="text-sm text-gray-400">{t(offer.priceUnit)}</span>
                    ) : null}
                  </div>

                  <ul className="space-y-4 mb-10 flex-1">
                    {offer.includes.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <Check className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-gray-600">{t(item)}</span>
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
                    <Link href={`/contact?offer=${offer.id}`}>{t(plan.cta)}</Link>
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="grid gap-px sm:grid-cols-2">
            {additionalOfferIds.map((id) => {
              const offer = getEvaluationOffer(id);
              return (
                <div key={offer.id} className="bg-white p-6 sm:p-8">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-base font-bold text-black">{t(offer.name)}</h3>
                    <span className="shrink-0 text-lg font-normal tracking-tight text-black tabular-nums">
                      {t(offer.price)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">
                    {t(offer.summary)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">{t("Prices exclude VAT.")}</p>
      </div>
    </section>
  );
}
