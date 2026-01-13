"use client";

import { Header } from "@/components/ui/header";
import { CollaborateForm } from "@/components/collaborate/collaborate-form";
import { MarketingFooter } from "@/components/marketing/footer";
import { useTranslations } from "@/lib/i18n/use-translations";
import { Sparkles, Database, Users, Shield } from "lucide-react";

export default function SimpleLandingPage() {
  const t = useTranslations();

  const features = [
    {
      icon: Database,
      title: t("Production-grade datasets"),
      description: t("Build high-quality datasets at scale with our global network of certified contributors."),
    },
    {
      icon: Users,
      title: t("Global contributor network"),
      description: t("Access a diverse, verified community ready to contribute to your AI training data needs."),
    },
    {
      icon: Shield,
      title: t("Compliance & governance"),
      description: t("Automated QA, secure payouts, and full compliance tracking built into every project."),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header translucent links={[]} />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-background to-muted/20 px-6 py-20 sm:px-8 lg:px-12">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/70 px-4 py-1.5 text-xs font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              {t("AI Dataset Crowdsourcing Platform")}
            </div>
            
            <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {t("Build production-grade datasets to train tailored AI models")}
            </h1>
            
            <p className="mx-auto mb-12 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              {t(
                "Caudals connects your ML team with certified contributors, reviewer pods, and automated payouts so every dataset sprint ships faster without compromising compliance or governance."
              )}
            </p>
          </div>
        </section>

        {/* Features Section */}
        <section className="border-b border-border/60 bg-background px-6 py-16 sm:px-8 lg:px-12">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
                {t("Why Caudals")}
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                {t("Everything you need to build and scale AI training datasets")}
              </p>
            </div>
            
            <div className="grid gap-8 md:grid-cols-3">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-border/60 bg-card p-6 shadow-sm"
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contact Form Section */}
        <section className="bg-muted/20 px-6 py-16 sm:px-8 lg:px-12">
          <div className="container mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
                {t("Get in touch")}
              </h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                {t(
                  "Interested in learning more? Send us a message and we'll get back to you within 48 hours."
                )}
              </p>
            </div>
            
            <div className="mx-auto max-w-2xl rounded-2xl border border-border/60 bg-white p-6 shadow-xl sm:p-8">
              <CollaborateForm />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
