"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslations } from "@/lib/i18n/context";

/** Ordered question ids; the copy lives in the message files. */
const faqIds = [
  "scope",
  "answerKey",
  "access",
  "data",
  "platforms",
  "certification",
  "after",
] as const;


export function FAQSection() {
  const t = useTranslations("faq");

  return (
    <section className="py-24 sm:py-32 bg-background">
      <div className="mx-auto max-w-4xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">{t("eyebrow")}</p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl leading-tight text-balance">
            {t("title")}
          </h2>
        </div>

        <Accordion type="single" collapsible className="border-t border-black/[0.08]">
          {faqIds.map((faqId, index) => (
            <AccordionItem
              key={faqId}
              value={`faq-${index}`}
              className="border-b border-black/[0.08] py-2"
            >
              <AccordionTrigger className="text-left text-lg font-bold text-black hover:text-teal-600 hover:no-underline transition-colors py-6">
                {t(`items.${faqId}.question`)}
              </AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-gray-500 pb-8">
                {t(`items.${faqId}.answer`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-16 p-8 rounded-2xl bg-black/[0.02] border border-black/[0.08] text-center">
          <p className="text-sm text-gray-600 leading-relaxed">
            {t("footnote")}
          </p>
        </div>
      </div>
    </section>
  );
}
