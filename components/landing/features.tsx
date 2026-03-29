"use client";

import { motion } from "framer-motion";
import {
  Database,
  Users,
  ShieldCheck,
  Zap,
  Activity,
  BarChart3,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

const capabilities = [
  {
    icon: Database,
    title: "Any modality, any device",
    description:
      "Image, text, audio, video, robotics, or sensor data. Desktop, mobile, wearables, and custom rigs all supported.",
  },
  {
    icon: Users,
    title: "Verified contributor workforce",
    description:
      "Layered vetting, ID verification, and device checks keep submissions authentic and diverse across 120+ countries.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance & governance",
    description:
      "Consent templates, audit trails, SOC2-ready exports, and regional storage controls keep legal teams comfortable.",
  },
  {
    icon: Zap,
    title: "Launch in days",
    description:
      "Blueprint wizard, training flows, and pre-built reviewer pods unlock first approvals in under 48 hours.",
  },
  {
    icon: Activity,
    title: "Live telemetry",
    description:
      "Track spend, throughput, and quality in one dashboard with alerts to Slack or email when thresholds slip.",
  },
  {
    icon: BarChart3,
    title: "Flexible economics",
    description:
      "Pay per approved submission or embed an operations pod on retainer. No hidden fees or tooling tax.",
  },
];

export function FeaturesSection() {
  const t = useTranslations();

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-20">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Capabilities")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl max-w-2xl">
            {t("Operational excellence, delivered as a platform")}
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
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-gray-50 text-gray-400 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                <capability.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-black mb-3">
                {t(capability.title)}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed max-w-[260px]">
                {t(capability.description)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
