"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  Building2,
  Truck,
  ShoppingBag,
  HeartPulse,
  Wheat,
  Landmark,
  Zap,
  Factory,
  Home,
  RadioTower,
  Umbrella,
} from "lucide-react";
import { landingModePublicEnabled } from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

export function SocialProofSection() {
  const t = useTranslations();
  const isLandingMode = landingModePublicEnabled;
  const industries = [
    { name: t("Logistics"), caption: t("GPS, routes, fleet telemetry"), icon: Truck },
    { name: t("Retail"), caption: t("Transactions, inventory, pricing"), icon: ShoppingBag },
    { name: t("Healthcare"), caption: t("Clinical records, imaging"), icon: HeartPulse },
    { name: t("Agriculture"), caption: t("Crop yields, sensor data"), icon: Wheat },
    { name: t("Fintech"), caption: t("Fraud patterns, transactions"), icon: Landmark },
    { name: t("Energy"), caption: t("Smart grid, consumption logs"), icon: Zap },
    { name: t("Manufacturing"), caption: t("IoT sensors, quality control"), icon: Factory },
    { name: t("Real Estate"), caption: t("Valuations, market trends"), icon: Home },
    { name: t("Telecom"), caption: t("Network traffic, usage data"), icon: RadioTower },
    { name: t("Insurance"), caption: t("Claims, risk assessments"), icon: Umbrella },
  ];
  const proofPoints = [
    {
      title: t("Data licensing"),
      value: t("Full legal compliance"),
      detail: t(
        "Every dataset includes clear licensing terms, provenance tracking, and GDPR-compliant processing agreements between supplier and buyer.",
      ),
      icon: FileCheck2,
    },
    {
      title: t("Quality assurance"),
      value: t("Preprocessed and validated"),
      detail: t(
        "Automated and manual QA pipelines clean, anonymize, and validate data before it reaches buyers. Quality scores published per dataset.",
      ),
      icon: ShieldCheck,
    },
    {
      title: t("Enterprise trust"),
      value: t("Built for B2B operations"),
      detail: t(
        "Dedicated account management, SLA-backed delivery, audit trails, and enterprise billing for both data suppliers and buyers.",
      ),
      icon: Building2,
    },
  ];

  return (
    <section className="relative py-24 sm:py-32 bg-white">
      <div className="relative z-10 mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="mb-16 text-center mx-auto max-w-3xl">
          <p className="text-[13px] font-bold text-teal-600 mb-4">
            {t("Industry coverage")}
          </p>
          <h2 className="text-4xl font-normal tracking-tight text-black sm:text-5xl">
            {t("Data from every industry, ready for your AI models")}
          </h2>
          <p className="text-base text-gray-500 mt-6 leading-relaxed">
            {t(
              "We work with companies across verticals to source, process, and deliver the datasets your ML team needs.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden sm:grid-cols-3 lg:grid-cols-5 mb-20">
          {industries.map((industry) => {
            const Icon = industry.icon;
            return (
              <div
                key={industry.name}
                className="bg-white p-6 flex min-h-[120px] flex-col justify-center transition-colors hover:bg-gray-50/50"
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <span className="text-base font-bold text-black mb-1">{industry.name}</span>
                <span className="text-[11px] text-gray-400 font-bold leading-tight">{industry.caption}</span>
              </div>
            );
          })}
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
            href="/contact"
            className="inline-flex items-center gap-2 text-sm font-bold text-black group"
          >
            {t("Talk to our team")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
