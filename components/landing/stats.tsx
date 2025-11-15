"use client";

import { motion } from "framer-motion";

export function StatsSection() {
  const stats = [
    {
      value: "12M+",
      label: "Approved data points",
      description: "Image, text, sensor, and multimodal submissions cleared through QA.",
    },
    {
      value: "52K",
      label: "Certified contributors",
      description: "120+ countries, 40+ languages, every major device category.",
    },
    {
      value: "95%",
      label: "Acceptance score",
      description: "Average consensus score across reviewer pods.",
    },
    {
      value: "<48h",
      label: "Time to first batch",
      description: "From blueprint approval to first accepted submission.",
    },
  ];

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="rounded-[2.4rem] border border-border/80 bg-card p-10">
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Proof in numbers</p>
            <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
              Scaling frontier AI responsibly
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Every metric combines human expertise and automation so you can trust the workflow end to end.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                viewport={{ once: true, margin: "-60px" }}
                className="rounded-3xl border border-border/70 bg-white p-6 text-left"
              >
                <div className="text-4xl font-semibold text-foreground">{stat.value}</div>
                <p className="mt-2 text-sm font-semibold uppercase text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{stat.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
