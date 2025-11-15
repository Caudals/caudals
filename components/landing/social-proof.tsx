"use client";

import { motion } from "framer-motion";

const ecosystems = [
  { name: "NVIDIA", caption: "GPU + Omniverse stacks" },
  { name: "PyTorch", caption: "Model-ready tensors" },
  { name: "Hugging Face", caption: "Dataset publishing" },
  { name: "TensorFlow", caption: "TFRecords & validation" },
  { name: "Pandas", caption: "Tabular governance" },
  { name: "Snowflake", caption: "Lakehouse exports" },
  { name: "AWS", caption: "Private cloud deployments" },
  { name: "Azure", caption: "Regional storage" },
  { name: "Lambda Labs", caption: "GPU infrastructure" },
  { name: "Stripe", caption: "Payout automation" },
];

export function SocialProofSection() {
  return (
    <section className="relative py-20">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(244,245,247,0.8),transparent_70%)]" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="flex flex-col items-center text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Ecosystems we plug into
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold text-foreground sm:text-4xl">
            Works across the stacks you already trust.
          </h2>
          <p className="mt-3 max-w-3xl text-balance text-base text-muted-foreground">
            Approved samples stream directly into NVIDIA, PyTorch, Hugging Face, Pandas, Snowflake,
            and every major cloud or payout partner. Replace the placeholders below with official
            SVG assets when ready.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ecosystems.map((ecosystem, index) => (
            <motion.div
              key={ecosystem.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: index * 0.04 }}
              viewport={{ once: true, margin: "-80px" }}
              className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-black/10 bg-white/80 p-4 text-center text-sm text-muted-foreground backdrop-blur"
            >
              <span className="text-base font-semibold uppercase tracking-wide text-foreground">
                {ecosystem.name}
              </span>
              <span className="text-xs text-muted-foreground/80">{ecosystem.caption}</span>
              <span className="mt-1 text-[10px] uppercase tracking-[0.5em] text-muted-foreground/60">
                Logo slot
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
