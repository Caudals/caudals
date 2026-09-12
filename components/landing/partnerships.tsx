"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FileText, Globe2, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";

const highlights = [
  {
    icon: Globe2,
    title: "Public, like a customer",
    description:
      "We use your public interface at human pace with fictional personas. No accounts, no personal data and no load testing.",
  },
  {
    icon: FileText,
    title: "A report you can use",
    description:
      "Your score, the failure categories and seven annotated transcripts, each next to the source it contradicts.",
  },
  {
    icon: MessagesSquare,
    title: "A 30-minute readout",
    description:
      "We walk you through the failures. If you want to go further, the next step is a Pilot Evaluation.",
  },
];

const contactMetrics = [
  { label: "First reply", value: "24 h" },
  { label: "Report ready in", value: "48 h" },
  { label: "Cost", value: "Free" },
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
              {t("Start here")}
            </p>
            <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl mb-8 leading-tight text-balance">
              {t("Start with a free Initial Diagnostic")}
            </h2>
            <p className="text-lg text-gray-500 mb-12 leading-relaxed">
              {t(
                "Send us the link to your assistant. We ask it forty questions whose answers are in your own public documentation and send you a six-page report within 48 hours. No access, no contract and no sales pitch inside.",
              )}
            </p>

            <div className="grid grid-cols-3 gap-8 mb-12">
              {contactMetrics.map((metric) => (
                <div key={metric.label}>
                  <p className="text-[10px] font-bold text-gray-400 mb-2">{t(metric.label)}</p>
                  <p className="text-2xl font-normal text-black tabular-nums">{t(metric.value)}</p>
                </div>
              ))}
            </div>

            <Button size="lg" asChild className="h-12 rounded-md bg-black px-8 text-base font-bold text-white hover:bg-black/90 transition-all hover:scale-[1.02]">
              <Link href="/contact?offer=reality-check">
                {t("Request an Initial Diagnostic")}
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
                  <p className="text-sm text-gray-500 leading-relaxed max-w-sm">
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
                  "Is your system internal? We can run our probe inside your network or score past conversations instead.",
                )}
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
