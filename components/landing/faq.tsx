"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslations } from "@/lib/i18n/use-translations";

const faqs = [
  {
    question: "What do you evaluate?",
    answer:
      "Text and document AI systems: customer assistants and chatbots on the web, in apps or on WhatsApp, voice and IVR agents, internal assistants over policies and manuals, document triage and extraction pipelines, and AI features inside products. We focus on systems where a wrong answer costs money.",
  },
  {
    question: "Who decides what the correct answer is?",
    answer:
      "Your documentation and your expert. Every case cites the document it comes from, and your domain expert signs off the answer key in a structured 90-minute session before we run anything, so the results can't be disputed later.",
  },
  {
    question: "Do you need access to our systems?",
    answer:
      "No. We can test a public interface the way a customer would, you can run our probe inside your own network and send back a signed results file, or we can score a sample of past conversations. We never need to hold production credentials.",
  },
  {
    question: "What happens to our documents and data?",
    answer:
      "Personal data is redacted as soon as we receive it, content is processed on EU infrastructure, and every paid engagement has an NDA and a data-processing agreement. The golden set is yours. We delete everything 12 months after the engagement ends, or sooner if you ask.",
  },
  {
    question: "How is this different from an evaluation platform?",
    answer:
      "Evaluation platforms are tools for developers who already have a test set. We write the test set: questions from your documents, your customers and your experts, graded with deterministic checks, a calibrated AI judge and human review.",
  },
  {
    question: "Do you certify our AI or make it AI Act compliant?",
    answer:
      "No. We measure and produce evidence: a scored, reproducible record of how your system behaves. That record is useful supporting documentation, but it is not a certification or a conformity assessment.",
  },
  {
    question: "What happens after the report?",
    answer:
      "The evaluation can keep running with a monthly subscription: new questions, new data and regression alerts every month. When it shows missing or contradictory knowledge, we build the data that closes the gap, and a re-run proves the score moved.",
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
            {t("What teams ask before an evaluation")}
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
