"use client";

import { FileText, Upload, CheckCircle, CreditCard } from "lucide-react";
import { motion } from "framer-motion";

const steps = [
  {
    icon: FileText,
    title: "Define your request",
    description:
      "Specify exactly what data you need, including format, quality criteria, and acceptance guidelines.",
    number: "01",
  },
  {
    icon: Upload,
    title: "Contributors submit",
    description:
      "Our global network of contributors reviews your request and submits data that meets your specifications.",
    number: "02",
  },
  {
    icon: CheckCircle,
    title: "Review and approve",
    description:
      "Use our built-in review tools to accept or reject submissions. Only pay for what you approve.",
    number: "03",
  },
  {
    icon: CreditCard,
    title: "Automatic payouts",
    description:
      "Approved submissions trigger automatic payments to contributors via Stripe Connect.",
    number: "04",
  },
];

export function HowItWorksSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center">
          <span className="rounded-full bg-muted px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Operating model
          </span>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            From idea to dataset in four steps
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
            We blend human review, automation, and transparent payouts so every program
            ships quickly without sacrificing accountability.
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              viewport={{ once: true, margin: "-50px" }}
              className="relative flex gap-6 rounded-3xl border border-border/60 bg-white/80 p-6 shadow-sm backdrop-blur"
            >
              <div className="flex flex-col items-center">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary shadow-inner shadow-primary/30">
                  {step.number}
                </div>
                {index < steps.length - 1 && (
                  <div className="mt-4 hidden h-full w-px bg-gradient-to-b from-primary/60 to-transparent lg:block" />
                )}
              </div>
              <div className="flex-1 space-y-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
