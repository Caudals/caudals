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
      "Contributors complete ID verification, device checks, sample submissions, and scenario-based training before joining live programs. You can add your own vetting layers as well.",
  },
  {
    question: "Can we bring our own contributor community?",
    answer:
      "Absolutely. Invite your existing workforce, apply the same QA + payout tooling, and mix them with Caudals-managed cohorts when you need more capacity.",
  },
  {
    question: "What is the typical time-to-launch?",
    answer:
      "Teams on Launch plans typically go live within 10 business days. Partnerships customers often start collecting data within their first week.",
  },
];

export function FAQSection() {
  const t = useTranslations();

  return (
    <section className="py-20">
      <div className="mx-auto max-w-4xl px-6 sm:px-8 lg:px-12">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{t("FAQ")}</p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
            {t("Answers before you schedule a walkthrough")}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {t(
              "Need more specifics? Book a call and we'll tailor the implementation plan to your governance, volume, and modality requirements.",
            )}
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              value={`faq-${index}`}
              className="overflow-hidden rounded-[1.5rem] border border-border/80 bg-card"
            >
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                viewport={{ once: true, margin: "-60px" }}
              >
                <AccordionTrigger className="px-6 py-5 text-left text-base font-semibold text-foreground">
                  {t(faq.question)}
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6 text-sm leading-relaxed text-muted-foreground">
                  {t(faq.answer)}
                </AccordionContent>
              </motion.div>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

