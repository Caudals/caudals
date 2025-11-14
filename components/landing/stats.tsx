"use client";

import { motion } from "framer-motion";

export function StatsSection() {
  const stats = [
    {
      value: "10M+",
      label: "Data points collected",
      description: "Across every data modality we support.",
    },
    {
      value: "50K+",
      label: "Active contributors",
      description: "Spanning 120+ countries and 40+ languages.",
    },
    {
      value: "95%",
      label: "Quality score",
      description: "Average acceptance rate on approved submissions.",
    },
    {
      value: "48hrs",
      label: "Average turnaround",
      description: "Time from program launch to first approved batch.",
    },
  ];

  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="rounded-[2.5rem] border border-border/40 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-10 text-white shadow-2xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary/70">
              Impact
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Trusted by teams building frontier AI
            </h2>
            <p className="mx-auto mt-3 max-w-3xl text-base text-slate-200">
              Every metric reflects how we operationalize responsible data creation while
              pairing teams with contributors who deeply understand their context.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true, margin: "-50px" }}
                className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left shadow-sm"
              >
                <div className="text-3xl font-bold text-white">{stat.value}</div>
                <p className="mt-1 text-sm font-semibold text-primary/60">
                  {stat.label}
                </p>
                <p className="mt-2 text-sm text-slate-200">{stat.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
