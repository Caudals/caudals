"use client";

import { motion } from "framer-motion";
import {
  AudioWaveform,
  Bot,
  FileStack,
  Layers,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

const systems = [
  {
    icon: Bot,
    title: "Customer assistants and chatbots",
    description: "On your website, in your app or on WhatsApp.",
  },
  {
    icon: AudioWaveform,
    title: "Voice and IVR agents",
    description: "The ones that answer your phone lines.",
  },
  {
    icon: Layers,
    title: "Internal assistants",
    description: "Over HR policy, sales material or technical manuals.",
  },
  {
    icon: FileStack,
    title: "Document pipelines",
    description: "Triage, classification and extraction.",
  },
  {
    icon: Sparkles,
    title: "AI features in your product",
    description: "Quote assistants, clause analysers and valuation explanations.",
  },
  {
    icon: Settings2,
    title: "Technical support and after-sales",
    description: "Machinery manuals, part numbers and workshop procedures.",
  },
];

export function UseCasesSection() {
  const t = useTranslations();

  return (
    <section className="py-24 sm:py-32 bg-background">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("What we evaluate")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl text-balance">
            {t("Systems where a wrong answer costs money")}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-gray-500 text-balance">
            {t(
              "We test text and document AI: the assistants your customers talk to and the ones your teams rely on.",
            )}
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-black/[0.08] bg-black/[0.08] sm:grid-cols-2 lg:grid-cols-3 shadow-sm">
          {systems.map((system, index) => (
            <motion.div
              key={system.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              viewport={{ once: true, margin: "-60px" }}
              className="group flex flex-col items-start bg-background p-8"
            >
              <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg border border-black/[0.08] bg-black/[0.03] text-neutral-700 transition-all duration-300 group-hover:border-black/[0.18] group-hover:bg-black/[0.06] group-hover:text-black group-hover:-translate-y-0.5">
                <system.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-105" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-bold text-black mb-2">{t(system.title)}</h3>
              <p className="text-sm leading-relaxed text-gray-500 transition-colors duration-300 group-hover:text-gray-700">
                {t(system.description)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
