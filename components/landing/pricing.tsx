"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import {
  EVALUATION_OFFERS,
  type EvaluationOfferId,
} from "@/lib/public/evaluation-offers";
import { cn } from "@/lib/utils";

const planCtas: Record<EvaluationOfferId, { label: string; featured: boolean }> = {
  "reality-check": { label: "Request an Initial Diagnostic", featured: false },
  "pilot-evaluation": { label: "Start a pilot", featured: true },
  "monthly-subscription": { label: "Ask about the subscription", featured: false },
};

export function PricingSection() {
  const t = useTranslations();

  return (
    <section id="pricing" className="py-24 sm:py-32 bg-gray-50/50">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Pricing")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl leading-tight text-balance">
            {t("Free to start. Never billed by the hour.")}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-gray-500 text-balance">
            {t(
              "The Initial Diagnostic is free. Pilots and subscriptions are quoted on the scope of your system, with a fixed price agreed before we start.",
            )}
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 shadow-sm lg:grid-cols-3">
          {EVALUATION_OFFERS.map((offer) => {
            const cta = planCtas[offer.id];
            return (
              <div key={offer.id} className="flex flex-col bg-white p-8 sm:p-10">
                <div className="mb-8">
                  <span className="mb-4 inline-flex rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-500">
                    {t(offer.duration)}
                  </span>
                  <h3 className="text-xl font-bold text-black mb-3">{t(offer.name)}</h3>
                  <p className="text-sm leading-relaxed text-gray-500 lg:min-h-[7.5rem]">
                    {t(offer.summary)}
                  </p>
                </div>

                <div className="mb-8">
                  <span className="text-3xl font-normal tracking-tight text-black">
                    {t(offer.price)}
                  </span>
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
                  variant={cta.featured ? "default" : "outline"}
                  className={cn(
                    "h-11 w-full rounded-md text-sm font-bold transition-all",
                    cta.featured
                      ? "bg-black text-white hover:bg-black/90"
                      : "border-gray-200 text-black hover:bg-gray-50"
                  )}
                  asChild
                >
                  <Link href={`/contact?offer=${offer.id}`}>{t(cta.label)}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
