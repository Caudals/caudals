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
    question: "What kind of data can I buy through Caudals?",
    answer:
      "Any structured or unstructured data useful for training AI models: transaction records, GPS routes, sensor data, medical records, satellite imagery, text corpora, and more. We source from companies across logistics, retail, healthcare, agriculture, fintech, and other verticals.",
  },
  {
    question: "How do you ensure data quality?",
    answer:
      "Every dataset passes through our automated QA pipeline: schema validation, deduplication, PII detection, format standardization, and completeness scoring. We also do manual review for custom-sourced datasets. Quality scores are published per dataset.",
  },
  {
    question: "Is the data GDPR compliant?",
    answer:
      "Yes. We handle PII detection and anonymization as part of processing. Every transaction includes a data processing agreement (DPA) and clear licensing terms. Supplier agreements cover ownership warranties and compliance responsibilities.",
  },
  {
    question: "How does it work for data suppliers?",
    answer:
      "Upload your data or connect your sources. We preprocess, anonymize, and list it in our catalog. When a buyer purchases access, you earn 60-70% revenue share. You control licensing terms and can set exclusivity preferences.",
  },
  {
    question: "How long does custom dataset sourcing take?",
    answer:
      "Catalog datasets are available immediately. For custom requests, we typically deliver within 1-3 weeks depending on scope, number of suppliers involved, and data volume.",
  },
  {
    question: "What formats do you deliver in?",
    answer:
      "We standardize all data to ML-ready formats: Parquet, JSON-Lines, CSV, or TFRecords. Buyers can also access data through our S3-compatible API for programmatic integration.",
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
            {t("Common questions about our data marketplace")}
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
              "Have a different question? Contact us and we'll get back to you within 24 hours.",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
