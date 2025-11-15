"use client";

import { motion } from "framer-motion";

const ecosystems = [
  { name: "NVIDIA", caption: "Omniverse + GPU workflows" },
  { name: "PyTorch", caption: "Model-ready tensors" },
  { name: "Hugging Face", caption: "Dataset distribution" },
  { name: "TensorFlow", caption: "TFRecords + eval" },
  { name: "Pandas", caption: "Tabular governance" },
  { name: "Snowflake", caption: "Lakehouse exports" },
  { name: "AWS", caption: "Private cloud deployments" },
  { name: "Azure", caption: "Regional storage" },
  { name: "Lambda Labs", caption: "GPU infrastructure" },
  { name: "Stripe", caption: "Global payouts" },
];

export function SocialProofSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Ecosystem fit</p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
            Plug Caudals into the stacks you already run
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Approved batches sync into NVIDIA, PyTorch, Hugging Face, Pandas, Snowflake, every major
            cloud, and the payout rails your finance team trusts.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ecosystems.map((ecosystem, index) => (
            <motion.div
              key={ecosystem.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.04 }}
              viewport={{ once: true, margin: "-80px" }}
              className="flex h-24 flex-col justify-center rounded-2xl border border-border/80 bg-card p-4 text-left"
            >
              <span className="text-base font-semibold text-foreground">{ecosystem.name}</span>
              <span className="text-xs text-muted-foreground">{ecosystem.caption}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
