"use client";

import {
  Database,
  Users,
  Shield,
  Zap,
  Globe,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Database,
    title: "Any data modality",
    description:
      "From images and text to audio, video, and sensor data—collect any type of data your model needs.",
  },
  {
    icon: Users,
    title: "Global contributor network",
    description:
      "Access a diverse pool of verified contributors from around the world for authentic, representative datasets.",
  },
  {
    icon: Shield,
    title: "Built-in quality control",
    description:
      "Automated validation, manual review workflows, and consensus mechanisms ensure data quality.",
  },
  {
    icon: Zap,
    title: "Ship faster",
    description:
      "Launch collection campaigns in minutes and start receiving submissions within hours, not weeks.",
  },
  {
    icon: Globe,
    title: "Compliance ready",
    description:
      "GDPR, CCPA, and custom consent flows built in. Store data securely with automatic audit trails.",
  },
  {
    icon: CheckCircle2,
    title: "Flexible pricing",
    description:
      "Pay only for approved submissions. No upfront costs, subscriptions, or hidden fees.",
  },
];

export function FeaturesSection() {
  return (
    <section className="relative py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[520px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-[160px]" />
      </div>
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center">
          <span className="rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold uppercase text-primary">
            Platform pillars
          </span>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to build better datasets
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-lg text-muted-foreground">
            Modular workflows combine global talent, human-centered review, and policy
            controls so you can scale responsible data programs with confidence.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true, margin: "-50px" }}
            >
              <Card className="group relative h-full overflow-hidden rounded-3xl border-border/40 bg-white/85 p-6 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:border-primary/40">
                <CardContent className="p-0">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary transition-transform group-hover:scale-110">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
