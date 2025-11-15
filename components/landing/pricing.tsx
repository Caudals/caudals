"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";

const plans = [
  {
    name: "Launch",
    description:
      "For teams kicking off a single modality or pilot program with guided support and curated contributors.",
    price: "$4,500/month",
    perks: [
      "Dataset blueprint + governance checklist",
      "Curated contributor pod & training toolkits",
      "Reviewer workspace with consensus scoring",
      "Stripe Connect payouts & compliance",
      "Email + async support",
    ],
    cta: "Book a blueprint call",
  },
  {
    name: "Scale",
    description:
      "Designed for companies running multiple modalities, custom tutorials, and regional contributor cohorts.",
    price: "$9,900/month",
    perks: [
      "Dedicated success manager & QA lead",
      "Contributor certification & requalification",
      "Custom tutorials + branded contributor portal",
      "Slack support with 4-hour SLA",
      "Insights reporting & quarterly roadmap reviews",
    ],
    cta: "Talk to our team",
  },
  {
    name: "Enterprise",
    description:
      "Bespoke engagements with architecture co-design, promotional placement, and private deployments.",
    price: "Custom",
    custom: true,
    perks: [
      "Embedded data ops pod & solution architects",
      "Dataset design + AI architecture consulting",
      "Private or regional deployments (VPC/on-prem)",
      "Featured marketplace placement & ads",
      "Executive reviews + procurement support",
    ],
    cta: "Plan an executive session",
  },
];

export function PricingSection() {
  const t = useTranslations();

  return (
    <section id="pricing" className="py-12 sm:py-16 lg:py-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:gap-10 sm:px-6 lg:gap-12 lg:px-12">
        <div className="text-center">
          <h2 className="mt-3 text-2xl font-semibold text-foreground sm:mt-6 sm:text-3xl lg:text-4xl">
            {t("Custom plans for ML teams, research labs, and enterprise partners")}
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
            {t(
              "Mix project-based briefs when you need a focused sprint or retain an embedded Caudals pod for managed operations. All plans bill only on approved submissions.",
            )}
          </p>
        </div>

        <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true, margin: "-60px" }}
              className="flex h-full flex-col gap-5 rounded-[1.5rem] border border-border/80 bg-white p-6 sm:gap-6 sm:rounded-[1.8rem] sm:p-8"
            >
              <div>
                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {t(plan.name)}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
                  {t(plan.description)}
                </p>
              </div>
              <ul className="space-y-2.5 text-xs text-muted-foreground sm:space-y-3 sm:text-sm">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 sm:gap-3">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted text-foreground sm:mt-1 sm:h-5 sm:w-5">
                      <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </span>
                    <span className="min-w-0">{t(perk)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto space-y-3 sm:space-y-4">
                <div>
                  <p className="pb-3 text-2xl font-semibold text-foreground sm:pb-4 sm:text-3xl">
                    {t(plan.price)}
                  </p>
                </div>
                <Button className="h-10 w-full text-sm sm:h-11 sm:text-base" size="lg">
                  {t(plan.cta)}
                  <ArrowUpRight className="ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-border/80 bg-card px-4 py-4 text-center text-xs text-muted-foreground sm:rounded-[1.6rem] sm:px-6 sm:py-5 sm:text-sm">
          {t(
            "Add-ons: dataset bootcamps for your contributors, private Slack channels, or promotional placement for requests in the browse feed. Mention them during your intro call.",
          )}
        </div>
      </div>
    </section>
  );
}
