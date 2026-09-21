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
import { useTranslations } from "@/lib/i18n/context";

/** Icon per system; the copy lives in the message files. */
const systems = [
  { id: "assistants", icon: Bot },
  { id: "voice", icon: AudioWaveform },
  { id: "internal", icon: Layers },
  { id: "documents", icon: FileStack },
  { id: "product", icon: Sparkles },
  { id: "support", icon: Settings2 },
] as const;

export function UseCasesSection() {
  const t = useTranslations("useCases");

  return (
    <section className="py-24 sm:py-32 bg-background">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("eyebrow")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl text-balance">
            {t("title")}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-gray-500 text-balance">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-black/[0.08] bg-black/[0.08] sm:grid-cols-2 lg:grid-cols-3 shadow-sm">
          {systems.map((system, index) => (
            <motion.div
              key={system.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              viewport={{ once: true, margin: "-60px" }}
              className="group flex flex-col items-start bg-background p-8"
            >
              <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg border border-black/[0.08] bg-black/[0.03] text-neutral-700 transition-all duration-300 group-hover:border-black/[0.18] group-hover:bg-black/[0.06] group-hover:text-black group-hover:-translate-y-0.5">
                <system.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-105" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-bold text-black mb-2">{t(`systems.${system.id}.title`)}</h3>
              <p className="text-sm leading-relaxed text-gray-500 transition-colors duration-300 group-hover:text-gray-700">
                {t(`systems.${system.id}.description`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
