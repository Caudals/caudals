import type { ReactNode } from "react";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type MarketingPageLayoutProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
};

export function MarketingPageLayout({
  eyebrow,
  title,
  description,
  children,
  ctaLabel,
  ctaHref,
}: MarketingPageLayoutProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,var(--ds-canvas)_0%,#ffffff_36%)]">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-20 pt-12 sm:px-8 lg:px-12">
        <section className="rounded-3xl border border-border/70 bg-card p-8 shadow-[var(--ds-shadow-overlay)] sm:p-10">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-500 sm:text-base">
            {description}
          </p>
          {ctaLabel && ctaHref ? (
            <div className="mt-6">
              <Button asChild>
                <Link href={ctaHref}>{ctaLabel}</Link>
              </Button>
            </div>
          ) : null}
        </section>
        <section className="space-y-6">{children}</section>
      </main>
      <MarketingFooter />
    </div>
  );
}
