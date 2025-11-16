"use client";

import Link from "next/link";
import { ArrowUpRight, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";

const resources = [
  {
    label: "Field guide: Designing multilingual dataset briefs",
    href: "/docs/designing-datasets",
    icon: Sparkles,
  },
  {
    label: "Download the Caudals security & compliance whitepaper",
    href: "/docs/security-whitepaper",
    icon: ShieldCheck,
  },
  {
    label: "Template: Contributor incentive calculator (Google Sheet)",
    href: "/docs/resources/incentive-calculator",
    icon: FileText,
  },
];

export function ResourceStrip() {
  const t = useTranslations();

  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-6 rounded-[1.8rem] border border-border/80 bg-card p-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {t("Keep exploring")}
            </p>
            <h3 className="text-2xl font-semibold text-foreground">
              {t("Resources to accelerate your next dataset sprint")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(
                "Save time with proven playbooks, security documentation, and planning templates used by teams already live on Caudals.",
              )}
            </p>
          </div>
          <ul className="grid gap-3 md:flex md:flex-1 md:flex-col">
            {resources.map((resource) => (
              <li key={resource.label}>
                <Link
                  href={resource.href}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-white px-4 py-3 text-sm text-foreground transition hover:border-foreground/15 hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <resource.icon className="h-4 w-4 text-accent" />
                    {t(resource.label)}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}







