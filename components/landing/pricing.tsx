"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/context";
import {
  EVALUATION_OFFERS,
  offerIncludeKeys,
} from "@/lib/public/evaluation-offers";
import { cn } from "@/lib/utils";

export function PricingSection() {
  const t = useTranslations("pricing");

  return (
    <section id="pricing" className="py-24 sm:py-32 bg-background border-t border-black/[0.08]">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("eyebrow")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl leading-tight text-balance">
            {t("title")}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-gray-500 text-balance">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-black/[0.08] bg-black/[0.08] shadow-sm lg:grid-cols-3">
          {EVALUATION_OFFERS.map((offer) => {
            return (
              <div key={offer.id} className="group flex flex-col bg-background p-8 sm:p-10">
                <div className="mb-8">
                  <span className="mb-4 inline-flex rounded-full bg-black/[0.03] border border-black/[0.08] px-2.5 py-1 text-[11px] font-bold text-gray-600 transition-colors duration-300 group-hover:border-black/[0.18] group-hover:bg-black/[0.06] group-hover:text-black">
                    {t(`offers.${offer.id}.duration`)}
                  </span>
                  <h3 className="text-xl font-bold text-black mb-3">{t(`offers.${offer.id}.name`)}</h3>
                  <p className="text-sm leading-relaxed text-gray-500 lg:min-h-[7.5rem] transition-colors duration-300 group-hover:text-gray-700">
                    {t(`offers.${offer.id}.summary`)}
                  </p>
                </div>

                <div className="mb-8">
                  <span className="text-3xl font-normal tracking-tight text-black">
                    {t(`offers.${offer.id}.price`)}
                  </span>
                </div>

                <ul className="space-y-4 mb-10 flex-1">
                  {offerIncludeKeys(offer).map((includeKey) => (
                    <li key={includeKey} className="flex items-start gap-3">
                      <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0 transition-transform duration-300 group-hover:scale-110" />
                      <span className="text-sm text-gray-600 transition-colors duration-300 group-hover:text-gray-800">
                        {t(includeKey)}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={offer.featured ? "default" : "outline"}
                  className={cn(
                    "h-11 w-full rounded-md text-sm font-bold transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
                    "group-hover:-translate-y-1 group-hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
                    offer.featured
                      ? "bg-black text-white hover:bg-neutral-900 group-hover:bg-neutral-900 group-hover:shadow-lg group-hover:shadow-black/15"
                      : "border-black/[0.14] bg-white text-black hover:bg-black hover:text-white hover:border-black group-hover:bg-black group-hover:text-white group-hover:border-black"
                  )}
                  asChild
                >
                  <Link
                    href={`/contact?offer=${offer.slug}`}
                    className="inline-flex w-full items-center justify-center gap-2"
                  >
                    <span>{t(`offers.${offer.id}.cta`)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1.5" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
