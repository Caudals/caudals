import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  FileText,
  KeyRound,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { landingModePublicNavigationLinks } from "@/lib/landing-mode";
import { buildPublicMetadata } from "@/lib/seo";
import { getServerTranslator } from "@/lib/i18n/server";
import { getPublicSecurityReviewData } from "@/lib/security/public-security-review";

export const dynamic = "force-dynamic";

export const metadata = buildPublicMetadata({
  title: "Security | Caudals",
  description:
    "Public security and compliance posture for Caudals buyers reviewing AI dataset operations.",
  pathname: "/security",
});

const postureHighlights = [
  {
    value: "RLS",
    label: "Tenant-scoped database access",
  },
  {
    value: "TOTP",
    label: "Optional operator hardening",
  },
  {
    value: "7 gates",
    label: "Dataset release controls",
  },
  {
    value: "R-01/R-13",
    label: "Runbook routing",
  },
];

const controlAreas = [
  {
    title: "Access and identity",
    icon: LockKeyhole,
    copy: "Better Auth sessions, Postgres RLS, optional operator MFA/passkeys, and audited JIT elevation protect internal operator access.",
    evidence: ["Password-only policy", "Optional MFA/passkeys", "JIT audit events"],
  },
  {
    title: "Dataset governance",
    icon: FileText,
    copy: "Every release path is built around provenance, license composition, PII review, QA scorecards, Croissant metadata, and Article 10 documentation.",
    evidence: ["G-1 to G-7 release gates", "License composition blocking", "Release documentation bundle"],
  },
  {
    title: "Runtime monitoring",
    icon: RadioTower,
    copy: "The private observability stack exports traces to Tempo, logs to Loki, and service metrics to Prometheus with internal Alertmanager rules.",
    evidence: ["OTel traces", "Loki log streams", "Prometheus alerts"],
  },
  {
    title: "Delivery integrity",
    icon: KeyRound,
    copy: "Delivery signing keys are generated in-app, encrypted before storage, and tied to operator audit evidence before a dataset package is released.",
    evidence: ["Ed25519 signing keys", "Encrypted private material", "Audit-linked release"],
  },
];

export default async function SecurityPage() {
  const [t, reviewData] = await Promise.all([
    getServerTranslator(),
    getPublicSecurityReviewData(),
  ]);

  return (
    <div className="min-h-screen bg-white text-gray-950">
      <Header
        links={[...landingModePublicNavigationLinks]}
        hideActions
      />
      <main>
        <section className="mx-auto grid w-full max-w-7xl gap-10 px-6 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pt-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              {t("Security review packet")}
            </div>
            <h1 className="mt-6 text-5xl font-normal leading-[0.96] tracking-tight text-black sm:text-6xl lg:text-7xl">
              {t("Security posture for AI data")}{" "}
              <span className="font-serif italic text-teal-700/90">
                {t("buyers")}
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-gray-500 sm:text-lg">
              {t(
                "Caudals publishes the security and compliance evidence buyers need before sharing briefs, reviewing samples, or approving a managed dataset delivery."
              )}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-md bg-black px-6 font-bold text-white hover:bg-black/90">
                <Link href="/contact">{t("Request review materials")}</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-[var(--ds-shadow-surface)]">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    {t("Live posture")}
                  </p>
                  <p className="mt-1 text-lg font-bold text-black">
                    {t("Operational trust evidence")}
                  </p>
                </div>
                <Image
                  src="/brand.png"
                  alt={t("Caudals security mark")}
                  width={54}
                  height={54}
                  className="h-12 w-12 rounded-md border border-gray-100 object-cover"
                  priority
                />
              </div>
              <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-gray-100 bg-gray-100 sm:grid-cols-2">
                {postureHighlights.map((item) => (
                  <div key={item.label} className="bg-white p-4">
                    <p className="font-mono text-lg font-bold tabular-nums text-black">
                      {t(item.value)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-gray-500">
                      {t(item.label)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-600" />
                  <p className="text-sm leading-6 text-amber-900">
                    {t(
                      "SOC 2 Type I and ISO 27001 controls are scoped, not certified. Formal audit and external on-call credentials remain tracked as open readiness items."
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-gray-100 bg-gray-50/70 py-20">
          <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
            <div className="max-w-3xl">
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                {t("Controls in production")}
              </p>
              <h2 className="mt-3 text-4xl font-normal tracking-tight text-black sm:text-5xl">
                {t("Security evidence is tied to operations.")}
              </h2>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-gray-100 bg-gray-100 lg:grid-cols-4">
              {controlAreas.map((area) => (
                <article key={area.title} className="bg-white p-6">
                  <area.icon className="h-6 w-6 text-emerald-700" />
                  <h3 className="mt-5 text-lg font-bold text-black">
                    {t(area.title)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-gray-500">
                    {t(area.copy)}
                  </p>
                  <div className="mt-5 space-y-2">
                    {area.evidence.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-xs font-medium text-gray-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        {t(item)}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-20 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:px-12">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-emerald-700">
              {t("Buyer diligence")}
            </p>
            <h2 className="mt-3 text-4xl font-normal tracking-tight text-black sm:text-5xl">
              {t("Fast answers for security review.")}
            </h2>
            <p className="mt-5 text-sm leading-6 text-gray-500">
              {t(
                "The public page answers first-pass procurement questions. NDA-bound evidence, DPA terms, and buyer-specific controls are routed through the contact workflow."
              )}
            </p>
          </div>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {reviewData.questionnaire.map((item) => (
              <div key={item.id} className="p-6">
                <h3 className="text-base font-bold text-black">
                  {t(item.question)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  {t(item.answer)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24 sm:px-8 lg:px-12">
          <div className="grid gap-8 rounded-xl border border-gray-200 bg-black p-6 text-white sm:p-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <ShieldCheck className="h-7 w-7 text-emerald-300" />
              <h2 className="mt-5 text-3xl font-normal tracking-tight sm:text-4xl">
                {t("Need the full review packet?")}
              </h2>
              <p className="mt-4 text-sm leading-6 text-gray-300">
                {t(
                  "Send the buyer security questionnaire, DPA request, or procurement checklist. Caudals routes it to the operator queue with the right evidence owner."
                )}
              </p>
              <Button asChild size="lg" className="mt-6 rounded-md bg-white px-6 font-bold text-black hover:bg-gray-100">
                <Link href="/contact">{t("Contact Caudals")}</Link>
              </Button>
            </div>
            <div className="grid gap-px overflow-hidden rounded-lg bg-white/10">
              {reviewData.reviewPacket.map((item) => (
                <div key={item.id} className="bg-white/[0.06] px-4 py-3 text-sm font-medium text-gray-100">
                  {t(item.title)}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter forceLandingMode />
    </div>
  );
}
