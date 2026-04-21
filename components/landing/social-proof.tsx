"use client";

import { motion } from "framer-motion";
import {
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
import { useTranslations } from "@/lib/i18n/use-translations";

export function SocialProofSection() {
  const t = useTranslations();
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

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-100 bg-gray-100 sm:grid-cols-3 lg:grid-cols-5">
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
      </div>
    </section>
  );
}
