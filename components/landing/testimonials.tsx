"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { useTranslations } from "@/lib/i18n/context";

/** Ordered ids; the quotes live in the message files. */
const testimonialIds = ["helioLabs", "polyphonic", "northwind"] as const;

export function TestimonialsSection() {
  const t = useTranslations("testimonials");

  return (
    <section className="relative py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.5),transparent_65%)]" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
            {t("title")}
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonialIds.map((id, index) => (
            <motion.blockquote
              key={id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              viewport={{ once: true, margin: "-60px" }}
              className="group flex h-full flex-col gap-6 rounded-[1.6rem] border border-black/[0.08] bg-background p-6 text-left shadow-sm"
            >
              <Quote className="h-6 w-6 text-teal-600 transition-transform duration-300 group-hover:scale-110" />
              <p className="text-base leading-relaxed text-slate-500 transition-colors duration-300 group-hover:text-slate-700">{t(`items.${id}.quote`)}</p>
              <div className="mt-auto space-y-1">
                <p className="text-sm font-semibold text-foreground transition-colors duration-300 group-hover:text-black">{t(`items.${id}.name`)}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {t(`items.${id}.role`)}
                </p>
              </div>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}








