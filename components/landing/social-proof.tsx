"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, FileCheck2, WalletCards } from "lucide-react";
import { landingModePublicEnabled } from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

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
    <section className="relative py-24 sm:py-32 bg-white">
      <div className="relative z-10 mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Ecosystem fit")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("Plug Caudals into the stacks you already run")}
          </h2>
          <p className="text-base text-gray-500 mt-6 leading-relaxed">
            {t(
              "Approved batches sync into every major cloud, ML framework, and the payout rails your finance team trusts.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden sm:grid-cols-3 lg:grid-cols-5 mb-20">
          {ecosystems.map((ecosystem, index) => (
            <div
              key={ecosystem.name}
              className="bg-white p-6 flex flex-col justify-center min-h-[120px] transition-colors hover:bg-gray-50/50"
            >
              <span className="text-base font-bold text-black mb-1">{ecosystem.name}</span>
              <span className="text-[11px] text-gray-400 font-bold leading-tight">{ecosystem.caption}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-12 md:grid-cols-3 pt-12 border-t border-gray-100">
          {proofPoints.map((point) => {
            const Icon = point.icon;
            return (
              <div key={point.title} className="group">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-600 mb-6 transition-transform group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-black mb-3">
                  {point.value}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {point.detail}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-20 flex flex-col items-center justify-between gap-6 p-8 rounded-xl bg-gray-50 sm:flex-row">
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/blog"
              className="text-sm font-medium text-gray-500 hover:text-black transition-colors"
            >
              {t("Read the blog")}
            </Link>
            <Link
              href="/trust"
              className="text-sm font-medium text-gray-500 hover:text-black transition-colors"
            >
              {t("Trust center")}
            </Link>
          </div>
          <Link
            href={isLandingMode ? "/contact" : REQUESTER_ONBOARDING_CTA}
            className="inline-flex items-center gap-2 text-sm font-bold text-black group"
          >
            {isLandingMode
              ? t("Book a conversation")
              : t("Launch onboarding")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
