"use client";

import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslations } from "@/lib/i18n/use-translations";

const faqs = [
  {
    question: "How do payouts and approvals work?",
    answer:
      "You pay only for submissions you approve. Stripe Connect handles multi-currency payouts, tax forms, and ledger exports so finance teams stay in control.",
  },
  {
    question: "Can we keep sensitive data private?",
    answer:
      "Yes. We offer regional storage controls, VPC or on-prem deployments, encryption at rest, and configurable consent templates for HIPAA/GDPR compliance.",
  },
  {
    question: "What modalities and devices do you support?",
    answer:
      "Vision, audio, text, sensor, robotics, and multimodal experiments across desktop, mobile, wearables, and custom hardware.",
  },
  {
    question: "How are contributors vetted?",
    answer:
      "Contributors complete ID verification, device checks, sample submissions, and scenario-based training before joining live programs.",
  },
  {
    question: "Can we bring our own contributor community?",
    answer:
      "Absolutely. Invite your existing workforce, apply the same QA + payout tooling, and mix them with Caudals-managed cohorts when you need more capacity.",
  },
  {
    question: "What is the typical time-to-launch?",
    answer:
      "Teams on Launch plans typically go live within 10 business days. Commercial pilots often move even faster once the first conversation is aligned.",
  },
];

export function FAQSection() {
  const t = useTranslations();

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-4xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">{t("FAQ")}</p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl leading-tight">
            {t("Answers before you schedule a walkthrough")}
          </h2>
        </div>

        <Accordion type="single" collapsible className="border-t border-gray-100">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              value={`faq-${index}`}
              className="border-b border-gray-100 py-2"
            >
              <AccordionTrigger className="text-left text-lg font-bold text-black hover:text-teal-600 transition-colors py-6">
                {t(faq.question)}
              </AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-gray-500 pb-8">
                {t(faq.answer)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        
        <div className="mt-16 p-8 rounded-2xl bg-gray-50 text-center">
          <p className="text-sm text-gray-500 leading-relaxed">
            {t(
              "Need more specifics? Book a call and we'll tailor the implementation plan to your governance, volume, and modality requirements.",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}







