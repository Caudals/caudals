"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Search, Settings, CreditCard, ShieldCheck, Package } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

type Role = "buyers" | "suppliers";

const flows: Record<Role, {
  title: string;
  steps: { label: string; description: string; icon: typeof Upload }[];
}> = {
  buyers: {
    title: "How companies buy data on Caudals",
    steps: [
      {
        label: "Describe what you need",
        description:
          "Tell us the data type, industry, volume, and format. Browse our catalog or request a custom dataset built from multiple sources.",
        icon: Search,
      },
      {
        label: "We source and process",
        description:
          "Our team contacts supplier companies, negotiates access, and combines data with public sources. Everything is cleaned and anonymized.",
        icon: Settings,
      },
      {
        label: "Review and validate",
        description:
          "Preview dataset samples, check quality scores, and review the schema before purchasing. Request adjustments if needed.",
        icon: ShieldCheck,
      },
      {
        label: "Download and integrate",
        description:
          "Access your dataset via signed URLs, S3-compatible API, or bulk download. ML-ready formats: Parquet, JSON-Lines, CSV.",
        icon: Package,
      },
    ],
  },
  suppliers: {
    title: "How companies sell data on Caudals",
    steps: [
      {
        label: "Upload your data",
        description:
          "Connect your data sources or upload files directly. We support any format — CSV, JSON, databases, APIs, or raw files.",
        icon: Upload,
      },
      {
        label: "We preprocess everything",
        description:
          "Our pipeline cleans, anonymizes, validates, and converts your data to standardized ML-ready formats automatically.",
        icon: Settings,
      },
      {
        label: "Published in our catalog",
        description:
          "Your dataset gets a public listing with metadata, quality scores, and sample previews. You control licensing terms.",
        icon: Package,
      },
      {
        label: "Earn revenue on every sale",
        description:
          "When a buyer purchases access, you earn a revenue share. Payments are settled automatically via Stripe Connect.",
        icon: CreditCard,
      },
    ],
  },
};

export function HowItWorksSection() {
  const t = useTranslations();
  const [role, setRole] = useState<Role>("buyers");

  return (
    <section className="py-24 sm:py-32 bg-white overflow-hidden">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12 text-center">
        <div className="flex flex-col items-center justify-center gap-8 mb-16 mx-auto max-w-3xl">
          <div>
            <p className="text-[13px] font-bold text-teal-600 mb-4">
              {t("Two sides, one platform")}
            </p>
            <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
              {t("Buy data or sell data — we handle the rest")}
            </h2>
          </div>

          <div className="flex p-1 bg-gray-100 rounded-lg h-11 w-full max-w-[320px]">
            {([
              { id: "buyers", label: "I need data" },
              { id: "suppliers", label: "I have data" },
            ] as { id: Role; label: string }[]).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRole(option.id)}
                className={cn(
                  "flex-1 rounded-md text-xs font-bold transition-all",
                  role === option.id
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={role}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <h3 className="text-2xl font-bold text-black mb-10 text-center">
              {t(flows[role].title)}
            </h3>

            <div className="grid gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden sm:grid-cols-2 lg:grid-cols-4 text-left">
              {flows[role].steps.map((step, index) => (
                <div key={step.label} className="bg-white p-8 flex flex-col items-start group hover:bg-gray-50/50 transition-colors">
                  <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-600 transition-transform group-hover:scale-110">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <p className="text-[10px] font-bold text-teal-600 mb-2">
                    {t("Step 0{{index}}", { index: index + 1 })}
                  </p>
                  <h4 className="text-lg font-bold text-black mb-3">
                    {t(step.label)}
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {t(step.description)}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
