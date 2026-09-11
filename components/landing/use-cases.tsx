"use client";

import { motion } from "framer-motion";
import { BookOpen, Boxes, FileText, MessageSquare, Phone } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

const systems = [
  {
    icon: MessageSquare,
    title: "Customer assistants and chatbots",
    description: "On your website, in your app or on WhatsApp.",
  },
  {
    icon: Phone,
    title: "Voice and IVR agents",
    description: "The ones that answer your phone lines.",
  },
  {
    icon: BookOpen,
    title: "Internal assistants",
    description: "Over HR policy, sales material or technical manuals.",
  },
  {
    icon: FileText,
    title: "Document pipelines",
    description: "Triage, classification and extraction.",
  },
  {
    icon: Boxes,
    title: "AI features in your product",
    description: "Quote assistants, clause analysers and valuation explanations.",
  },
];

export function UseCasesSection() {
  const t = useTranslations();

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("What we evaluate")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("Systems where a wrong answer costs money")}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-gray-500">
            {t(
              "We test text and document AI: the assistants your customers talk to and the ones your teams rely on.",
            )}
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-gray-100 bg-gray-100 sm:grid-cols-2 lg:grid-cols-3">
          {systems.map((system, index) => (
            <motion.div
              key={system.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              viewport={{ once: true, margin: "-60px" }}
              className="group flex flex-col items-start bg-white p-8"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-gray-50 text-gray-400 transition-colors group-hover:bg-teal-50 group-hover:text-teal-600">
                <system.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-black mb-2">{t(system.title)}</h3>
              <p className="text-sm leading-relaxed text-gray-500">
                {t(system.description)}
              </p>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: systems.length * 0.05 }}
            viewport={{ once: true, margin: "-60px" }}
            className="flex flex-col items-start bg-gray-50/60 p-8"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-4">
              {t("Questions that matter")}
            </p>
            <p className="text-sm leading-relaxed text-gray-600">
              {t(
                "Coverage and waiting periods, banking fees and eligibility, energy and telecom tariffs, refund rights, dosage and interactions, technical specifications.",
              )}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
