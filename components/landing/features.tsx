"use client";

import { motion } from "framer-motion";
import {
  Database,
  History,
  KeyRound,
  Languages,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

const capabilities = [
  {
    icon: ShieldCheck,
    title: "Answer keys your experts sign",
    description:
      "Every case cites your own documentation, and your expert signs off the answer key before anything runs.",
  },
  {
    icon: Workflow,
    title: "Every failure has a cause",
    description:
      "Knowledge gap, retrieval miss, invented answer or outdated document: you know whether to fix the documentation or the system.",
  },
  {
    icon: Languages,
    title: "Real-world language and edge cases",
    description:
      "Cases reflect how real customers write: typos, regional phrasing, industry jargon, and mixed Spanish and English where relevant.",
  },
  {
    icon: KeyRound,
    title: "No production credentials needed",
    description:
      "We test public interfaces as a customer would, you run our probe inside your network, or we score past conversations.",
  },
  {
    icon: History,
    title: "Runs you can reproduce",
    description:
      "Every run keeps its suite version, model fingerprint and grader, so a silent model change by your vendor shows up in the numbers.",
  },
  {
    icon: Database,
    title: "A test set you own",
    description:
      "You keep the golden set as JSONL, and it grows every month with new questions and new data.",
  },
];

export function FeaturesSection() {
  const t = useTranslations();

  return (
    <section className="py-24 sm:py-32 bg-background">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Why Caudals")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl max-w-2xl text-balance">
            {t("We deliver verifiable evidence")}
          </h2>
        </div>

        <div className="grid gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability, index) => (
            <motion.div
              key={capability.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              viewport={{ once: true, margin: "-60px" }}
              className="group flex flex-col items-start"
            >
              <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg border border-black/[0.08] bg-black/[0.03] text-neutral-700 transition-all duration-300 group-hover:border-black/[0.18] group-hover:bg-black/[0.06] group-hover:text-black group-hover:-translate-y-0.5">
                <capability.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-105" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-bold text-black mb-3">
                {t(capability.title)}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed transition-colors duration-300 group-hover:text-gray-700">
                {t(capability.description)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
