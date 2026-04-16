"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";

export function CTASection() {
  const t = useTranslations();

  return (
    <section className="py-32 sm:py-48 bg-white border-t border-gray-100">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12 text-center">
        <div className="flex flex-col items-center gap-8">
          <p className="text-[13px] font-bold text-teal-600">
            {t("Get started")}
          </p>
          <h2 className="text-5xl font-normal tracking-tight text-black sm:text-7xl max-w-3xl leading-[1.1]">
            {t("Ready to get the data your AI needs?")}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-500 leading-relaxed">
            {t(
              "Tell us what data you need or what data you can offer. We'll scope the opportunity and get back to you within 24 hours.",
            )}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center mt-4">
            <Button size="lg" className="h-14 min-w-[240px] rounded-md bg-black text-white hover:bg-black/90 text-base font-bold transition-all hover:scale-[1.02]" asChild>
              <Link href="/contact">
                {t("I need a dataset")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 min-w-[240px] rounded-md border-gray-200 text-black hover:bg-gray-50 text-base font-bold transition-all"
              asChild
            >
              <Link href="/contact">
                {t("I want to sell data")}
              </Link>
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center gap-6 mt-12 text-sm font-medium text-gray-400 sm:flex-row sm:gap-10">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-teal-500" />
              <span className="text-gray-900">{t("GDPR-compliant processing")}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-teal-500" />
              <span className="text-gray-900">{t("No commitment to start")}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
