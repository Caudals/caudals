"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Flame, Globe2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

const highlights = [
  {
    icon: Target,
    title: "Discovery calls",
    description:
      "Talk directly with the team about scope, dataset modalities, and rollout constraints.",
  },
  {
    icon: Globe2,
    title: "Pilot scoping",
    description:
      "We map an initial pilot, estimate operational shape, and suggest the right commercial path.",
  },
  {
    icon: Flame,
    title: "Fast follow-up",
    description:
      "We move quickly from email to a focused working session to start validating demand.",
  },
];

const contactMetrics = [
  { label: "First reply", value: "48h" },
  { label: "Working sessions", value: "Weekly" },
  { label: "Pilot scoping", value: "Fast" },
];

export function ContactSection() {
  const t = useTranslations();

  return (
    <section id="contact" className="py-24 sm:py-32 bg-gray-50/50">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="grid gap-20 lg:grid-cols-2 lg:items-start">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-80px" }}
          >
            <p className="text-[13px] font-bold text-teal-600 mb-4">
              {t("Contact")}
            </p>
            <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl mb-8 leading-tight">
              {t(
                "Talk with Caudals about your next dataset program",
              )}
            </h2>
            <p className="text-lg text-gray-500 mb-12 leading-relaxed">
              {t(
                "Use the public contact flow to start the conversation. We review fit, clarify scope, and move promising conversations into a focused working session fast.",
              )}
            </p>

            <div className="grid grid-cols-3 gap-8 mb-12">
              {contactMetrics.map((metric) => (
                <div key={metric.label}>
                  <p className="text-[10px] font-bold text-gray-400 mb-2">{t(metric.label)}</p>
                  <p className="text-2xl font-normal text-black">{t(metric.value)}</p>
                </div>
              ))}
            </div>

            <Button size="lg" asChild className="h-12 rounded-md bg-black px-8 text-base font-bold text-white hover:bg-black/90 transition-all hover:scale-[1.02]">
              <Link href="/contact">
                {t("Open contact form")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>

          <div className="space-y-12">
            {highlights.map((highlight, index) => (
              <motion.div
                key={highlight.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true, margin: "-70px" }}
                className="flex gap-6 group"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white border border-gray-100 text-gray-400 group-hover:text-teal-600 group-hover:bg-teal-50 transition-colors shadow-sm">
                  <highlight.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-black mb-2">{t(highlight.title)}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
                    {t(highlight.description)}
                  </p>
                </div>
              </motion.div>
            ))}
            
            <motion.div 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="p-6 rounded-xl border border-gray-100 bg-white/50 text-sm text-gray-400 leading-relaxed"
            >
              <p>
                {t(
                  "Need pricing context, a buyer conversation, or a tailored rollout? Start from one contact point and we will route the right next step fast.",
                )}
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}



