import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Header } from "@/components/ui/header";
import { HeroSection } from "@/components/landing/hero";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_55%),_linear-gradient(180deg,_rgba(255,255,255,0.9),_rgba(250,250,249,1))]">
      <Header
        links={[
          { href: "/browse", label: "Browse requests" },
          { href: "/requests/preview", label: "Request examples" },
          { href: "#how-it-works", label: "How it works" },
          { href: "#why-us", label: "Why us" },
        ]}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-6 pb-24 pt-20 sm:px-8 lg:px-12">
        <HeroSection />

        <section
          id="how-it-works"
          className="grid gap-12 rounded-[2rem] border border-border bg-white/85 p-8 shadow-soft-md backdrop-blur-lg sm:p-12 lg:grid-cols-[1.1fr_0.9fr]"
        >
          <div className="space-y-6">
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary"
            >
              How it works
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Structured workflows for dataset creation
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              Seamlessly orchestrate every stage-from scoping a dataset to
              rewarding contributors. Our workflow enforces quality, compliance,
              and auditable approvals, so your team ships trusted data faster.
            </p>
            <div className="space-y-8">
              {[
                {
                  step: "01",
                  title: "Launch requests in minutes",
                  body: "Use modular prompts to define collection scopes, acceptance criteria, consent forms, and reward structures.",
                },
                {
                  step: "02",
                  title: "Collect & iterate securely",
                  body: "Contributors upload large files via resumable flows. Versioned feedback loops keep submissions compliant.",
                },
                {
                  step: "03",
                  title: "Approve & payout with trust",
                  body: "Flag issues, auto-approve with QA checks, and trigger automated Stripe Connect payouts when you’re satisfied.",
                },
              ].map(({ step, title, body }) => (
                <div key={step} className="flex items-start gap-4">
                  <span className="rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                    {step}
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex flex-col gap-6 rounded-3xl border border-border bg-gradient-to-br from-white via-white to-primary/10 p-6">
            <div className="space-y-3">
              <h3 className="text-xl font-semibold text-slate-900">
                Trusted handoffs
              </h3>
              <p className="text-sm text-muted-foreground">
                Requesters collaborate with contributors in a shared workspace.
                Every change is logged, ensuring compliance and auditable
                provenance.
              </p>
            </div>
            <Separator className="bg-border/60" />
            <div className="flex flex-col gap-5">
              <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/10 p-5">
                <p className="text-sm font-medium text-primary">
                  Admin dashboards aggregate request health, contributions in
                  review, and payout pipelines for finance.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-white/90 p-5">
                <p className="text-sm text-muted-foreground">
                  Real-time notifications keep teams aligned: new submissions,
                  approvals, payout events, and policy updates.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-white/90 p-5">
                <p className="text-sm text-muted-foreground">
                  Storage abstraction supports Supabase today and S3 tomorrow—no
                  refactors needed.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="why-us"
          className="space-y-12 rounded-[2rem] bg-white/80 px-6 py-12 shadow-soft-md sm:px-12"
        >
          <div className="flex flex-col gap-6 text-center">
            <Badge
              variant="outline"
              className="self-center border-primary/20 bg-primary/5 text-primary"
            >
              Why Dataset Forge
            </Badge>
            <h2 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
              Purpose-built for the new wave of AI dataset creation
            </h2>
            <p className="mx-auto max-w-3xl text-muted-foreground">
              We combine enterprise-grade governance with community-driven
              speed. Every feature helps you deliver safe, diverse datasets
              across modalities and compliance regimes.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Role-aware workflows",
                description:
                  "Tailored dashboards for requesters, contributors, and admins ensure everyone has clarity and control.",
              },
              {
                title: "Global payouts, unified",
                description:
                  "Stripe Connect Express handles KYC, tax, and payouts per region while the platform tracks fees and approvals.",
              },
              {
                title: "Secure by design",
                description:
                  "Supabase Auth, RLS policies, and signed storage URLs lock down sensitive submissions without compromising DX.",
              },
              {
                title: "Composable storage",
                description:
                  "Supabase Storage today, plug-and-play S3 tomorrow. Our provider interface keeps upload flows consistent.",
              },
              {
                title: "Real-time visibility",
                description:
                  "Supabase Realtime powers in-app notifications, so reviewers never miss contributor activity.",
              },
              {
                title: "Testing & automation",
                description:
                  "CI, Playwright smoke paths, and typed APIs mean your team ships confidently from day one.",
              },
            ].map(({ title, description }) => (
              <Card
                key={title}
                className="border-muted/70 bg-white/90 shadow-soft-md"
              >
                <CardContent className="space-y-3 px-6 py-8">
                  <h3 className="text-xl font-semibold text-slate-900">
                    {title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-oa-conic/20 px-6 py-12 shadow-soft-md backdrop-blur-lg sm:px-16">
          <div className="flex flex-col items-center gap-6 text-center">
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary"
            >
              Ready to build?
            </Badge>
            <h2 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
              Launch your next dataset request today
            </h2>
            <p className="max-w-2xl text-muted-foreground">
              Whether you need speech samples, synthetic imagery, or measurement
              data, Dataset Forge scales your operations without sacrificing
              quality.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button size="lg" asChild className="min-w-[200px]">
                <Link href="/dashboard/requests/new">
                  Post a dataset request
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="min-w-[200px] border-muted bg-white/80"
              >
                <Link href="/browse">Explore open calls</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <footer className="mt-20 border-t border-border/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              &copy; {new Date().getFullYear()} Dataset Forge. All rights
              reserved.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
            <Link href="mailto:hello@datasetforge.ai">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
