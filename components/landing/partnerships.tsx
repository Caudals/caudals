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
    <section id="contact" className="py-24 sm:py-32 bg-background">
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

            <div className="flex flex-col sm:flex-row gap-4 mb-16">
              <Button size="lg" asChild className="h-12 px-8 rounded-md bg-black text-white hover:bg-black/90 text-sm font-bold shadow-sm">
                <Link href="/contact?offer=diagnostic">
                  {t("Request free diagnostic")}
                </Link>
              </Button>
              <Button size="lg" variant="ghost" asChild className="h-12 px-8 rounded-md text-black hover:bg-black/5 text-sm font-bold">
                <Link href="/call">
                  {t("Or book a 30-min call")}
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-12 border-t border-black/[0.08]">
              {contactMetrics.map((metric) => (
                <div key={metric.label}>
                  <p className="text-2xl font-normal tracking-tight text-black sm:text-3xl mb-1">
                    {t(metric.value)}
                  </p>
                  <p className="text-xs text-gray-500 font-medium">{t(metric.label)}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="space-y-8 lg:pt-16">
            {highlights.map((highlight, index) => (
              <motion.div
                key={highlight.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true, margin: "-70px" }}
                className="flex gap-6 group"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] bg-black/[0.03] text-neutral-700 transition-all duration-300 group-hover:border-black/[0.18] group-hover:bg-black/[0.06] group-hover:text-black group-hover:-translate-y-0.5">
                  <highlight.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-105" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-black mb-2">{t(highlight.title)}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-sm transition-colors duration-300 group-hover:text-gray-700">
                    {t(highlight.description)}
                  </p>
                </div>
              </motion.div>
            ))}

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="p-6 rounded-xl border border-black/[0.08] bg-black/[0.02] text-sm text-gray-600 leading-relaxed"
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
