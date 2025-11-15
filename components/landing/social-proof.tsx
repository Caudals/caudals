"use client";

import { motion } from "framer-motion";
import { useTranslations } from "@/lib/i18n/use-translations";

export function SocialProofSection() {
  const t = useTranslations();
  const ecosystems = [
    { name: "NVIDIA", caption: t("Omniverse + GPU workflows") },
    { name: "PyTorch", caption: t("Model-ready tensors") },
    { name: "Hugging Face", caption: t("Dataset distribution") },
    { name: "TensorFlow", caption: t("TFRecords + eval") },
    { name: "Pandas", caption: t("Tabular governance") },
    { name: "Snowflake", caption: t("Lakehouse exports") },
    { name: "AWS", caption: t("Private cloud deployments") },
    { name: "Azure", caption: t("Regional storage") },
    { name: "Lambda Labs", caption: t("GPU infrastructure") },
    { name: "Stripe", caption: t("Global payouts") },
  ];

  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {t("Ecosystem fit")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
            {t("Plug Caudals into the stacks you already run")}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {t(
              "Approved batches sync into NVIDIA, PyTorch, Hugging Face, Pandas, Snowflake, every major cloud, and the payout rails your finance team trusts.",
            )}
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
