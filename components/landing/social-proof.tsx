"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, FileCheck2, WalletCards } from "lucide-react";
import { landingModePublicEnabled } from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";

const REQUESTER_ONBOARDING_CTA =
  "/auth/sign-up?role=requester&next=/requester/onboarding";

export function SocialProofSection() {
  const t = useTranslations();
  const isLandingMode = landingModePublicEnabled;
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
  const proofPoints = [
    {
      title: t("Funding controls"),
      value: t("Approval-linked billing"),
      detail: t(
        "Requesters fund datasets and only approved submissions move through payout rails.",
      ),
      icon: FileCheck2,
    },
    {
      title: t("Payout operations"),
      value: t("Ledger-backed transfers"),
      detail: t(
        "Contributor payouts reconcile against transaction, wallet, and webhook consistency checks.",
      ),
      icon: WalletCards,
    },
    {
      title: t("Trust posture"),
      value: t("Security baseline published"),
      detail: t(
        "Security controls, abuse prevention, and reliability procedures are documented for buyers.",
      ),
      icon: BadgeCheck,
    },
  ];

  return (
    <section className="relative py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[31rem] bg-[linear-gradient(180deg,rgba(249,250,251,0)_0%,rgba(249,250,251,0.03)_18%,rgba(249,250,251,0.1)_34%,rgba(249,250,251,0.24)_50%,rgba(249,250,251,0.52)_70%,rgba(249,250,251,0.86)_88%,rgba(249,250,251,1)_100%)] backdrop-blur-[1.5px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-40 z-0 h-52 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.62)_0%,rgba(255,255,255,0.22)_40%,rgba(255,255,255,0)_74%)] blur-3xl"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {t("Ecosystem fit")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">
            {t("Plug Caudals into the stacks you already run")}
          </h2>
          <p className="mt-3 text-base text-slate-500">
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
              <span className="text-xs text-slate-500">{ecosystem.caption}</span>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-6">
          <div className="grid gap-3 md:grid-cols-3">
            {proofPoints.map((point) => {
              const Icon = point.icon;
              return (
                <div
                  key={point.title}
                  className="rounded-2xl border border-border/70 bg-background/80 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-500" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {point.title}
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {point.value}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {point.detail}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {isLandingMode ? (
                <>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 hover:bg-background"
                  >
                    {t("Contact Caudals")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href="/blog"
                    className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 hover:bg-background"
                  >
                    {t("Read the blog")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/trust"
                    className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 hover:bg-background"
                  >
                    {t("Trust center")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href="/docs/security-baseline"
                    className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 hover:bg-background"
                  >
                    {t("Security baseline")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              )}
            </div>

            <Link
              href={isLandingMode ? "/contact" : REQUESTER_ONBOARDING_CTA}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background hover:bg-foreground/90"
            >
              {isLandingMode
                ? t("Book the first conversation")
                : t("Launch requester onboarding")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
