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
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Why ML teams choose Caudals</p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
            Operational excellence, delivered as a platform
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Layer human expertise with automation to keep your dataset programs measurable, compliant, and fast.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability, index) => (
            <motion.div
              key={capability.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              viewport={{ once: true, margin: "-60px" }}
              className="rounded-3xl border border-border/80 bg-card p-6 text-left"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground">
                <capability.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{capability.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{capability.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
