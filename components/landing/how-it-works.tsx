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
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            How it works
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            From concept to dataset in four simple steps
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
              className="relative flex gap-6"
            >
              <div className="flex flex-col items-center">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-bold text-slate-900 shadow-lg shadow-primary/25 transition-transform hover:scale-110">
                  {step.number}
                </div>
                {index < steps.length - 1 && (
                  <div className="mt-4 h-full w-px bg-gradient-to-b from-primary/50 to-transparent lg:block hidden" />
                )}
              </div>
              <div className="flex-1 pb-8">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 transition-transform hover:scale-110">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">
                  {step.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
