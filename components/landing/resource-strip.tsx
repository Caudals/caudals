"use client";

import Link from "next/link";
import { ArrowUpRight, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { landingModePublicEnabled } from "@/lib/landing-mode";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

const docsResources = [
  {
    label: "Field guide: Designing multilingual dataset briefs",
    href: "/docs/designing-datasets",
    icon: Sparkles,
    category: "Guides"
  },
  {
    label: "Download the Caudals security & compliance whitepaper",
    href: "/docs/security-whitepaper",
    icon: ShieldCheck,
    category: "Security"
  },
  {
    label: "Template: Contributor incentive calculator",
    href: "/docs/resources/incentive-calculator",
    icon: FileText,
    category: "Tools"
  },
];

const blogResources = [
  {
    label: "Launching Caudals: a clearer control plane for dataset operations",
    href: "/blog/launching-caudals-clearer-dataset-operations",
    icon: Sparkles,
    category: "Company"
  },
  {
    label: "Operational playbooks for multimodal datasets",
    href: "/blog/operational-playbooks-for-multimodal-datasets",
    icon: ShieldCheck,
    category: "Operations"
  },
  {
    label: "How we review contributor quality signals",
    href: "/blog/how-we-review-contributor-quality-signals",
    icon: FileText,
    category: "Quality"
  },
];

export function ResourceStrip() {
  const t = useTranslations();
  const isLandingMode = landingModePublicEnabled;
  const resources = isLandingMode ? blogResources : docsResources;

  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
        <div className="flex flex-col lg:flex-row gap-16">
          <div className="lg:w-1/3">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-4">
              {t("Resources")}
            </p>
            <h2 className="text-3xl font-normal tracking-tight text-black mb-6 leading-tight">
              {isLandingMode
                ? t("Signal from the Caudals blog")
                : t("Accelerate your next dataset sprint")}
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              {isLandingMode
                ? t(
                    "Read how we think about dataset operations, contributor quality, and launch sequencing.",
                  )
                : t(
                    "Save time with proven playbooks, security documentation, and planning templates used by teams on Caudals.",
                  )}
            </p>
          </div>
          
          <div className="lg:w-2/3 border-t border-gray-100">
            {resources.map((resource) => (
              <Link
                key={resource.label}
                href={resource.href}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-8 border-b border-gray-100 last:border-0"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{t(resource.category)}</span>
                    <span className="text-gray-300">&middot;</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Resource</span>
                  </div>
                  <h3 className="text-xl font-normal text-black group-hover:underline decoration-1 underline-offset-4">
                    {t(resource.label)}
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-gray-400 group-hover:text-black transition-colors">
                  <span className="text-xs font-medium hidden sm:block">View</span>
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}







