import type { Metadata } from "next";
import { Building2, Handshake, ShieldCheck, Sparkles } from "lucide-react";

import { Header } from "@/components/ui/header";
import { Badge } from "@/components/ui/badge";
import { CollaborateForm } from "@/components/collaborate/collaborate-form";
import { MarketingFooter } from "@/components/marketing/footer";

export const metadata: Metadata = {
  title: "Partnerships with Caudals",
  description:
    "Partner with Caudals to co-create responsible AI datasets, launch global programs, and unlock new collaboration models.",
};

const highlights = [
  {
    icon: Sparkles,
    title: "Custom programs",
    description:
      "We design joint initiatives to co-create datasets, fund challenges, and share intellectual property.",
  },
  {
    icon: Building2,
    title: "Government & public sector",
    description:
      "We support public organizations to build open data and ensure responsible processes.",
  },
  {
    icon: Handshake,
    title: "Global talent network",
    description:
      "Over 40 countries represented, ready to activate collections with geographic and cultural diversity.",
  },
  {
    icon: ShieldCheck,
    title: "Trust standards",
    description:
      "Review processes, audits, and privacy controls that adapt to your internal requirements.",
  },
];

export default function PartnershipsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-white via-white to-slate-50">
      <Header translucent />
      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-12 px-6 pb-20 pt-16 sm:px-8 sm:pt-20 lg:px-12">
          {/* Header Section */}
          <div className="w-full space-y-4 text-center">
            <Badge variant="outline" className="bg-primary/10 text-primary">
              Partnerships
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Partner with Caudals
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              We design partnerships with companies, public institutions, and
              community organizations to deploy responsible data collection
              programs.
            </p>
          </div>

          {/* Form Section - Central Focus */}
          <div className="w-full max-w-2xl">
            <CollaborateForm />
          </div>

          {/* Highlights Section - Below Form */}
          <div className="w-full space-y-6">
            <h2 className="text-center text-2xl font-semibold text-slate-900">
              Why partner with us?
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {highlights.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-border/60 bg-white/80 p-5 shadow-sm backdrop-blur"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Contact Section */}
          <div className="w-full rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
            <p className="text-sm uppercase tracking-[0.2em] text-primary">
              Prefer email?
            </p>
            <p className="mt-3 text-lg text-slate-900">
              You can also reach us directly at
              <a
                className="ml-2 font-semibold text-primary hover:underline"
                href="mailto:contact@caudals.com"
              >
                contact@caudals.com
              </a>
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
