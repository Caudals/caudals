"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { CTASection } from "@/components/landing/cta";
import { HeroChat } from "@/components/landing/hero-chat";
import { LandingShell } from "@/components/landing/landing-shell";
import { splitMarked } from "@/components/landing/marks";
import { Breadcrumbs } from "@/components/sectors/breadcrumbs";
import type { RelatedSector } from "@/components/sectors/sector-page-client";
import { useTranslations } from "@/lib/i18n/context";

type HubSector = RelatedSector & { audience: string };

/** The sectors hub: one line per sector and a way into each page. */
export function SectorsHubClient({ sectors }: { sectors: readonly HubSector[] }) {
  const t = useTranslations("sectors");
  const tHero = useTranslations("hero");
  const headline = splitMarked(t("hubHeadline"));

  return (
    <LandingShell>
      <Breadcrumbs items={[{ label: t("home"), href: "/" }, { label: t("hub") }]} />

      <section className="lp-wrap lp-hero sx-hero">
        <div>
          <h1 className="lp-h1 sx-h1 lp-rise">
            {headline.before}
            {headline.marked ? <em>{headline.marked}</em> : null}
            {headline.after}
          </h1>
          <p className="lp-sub lp-rise" style={{ ["--d" as string]: 0.08 }}>
            {t("hubSubtitle")}
          </p>
          <div className="lp-hero-act lp-rise" style={{ ["--d" as string]: 0.16 }}>
            <Link href="/contact?offer=reality-check" className="lp-btn">
              {tHero("primaryCta")}
              <span className="lp-arr" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </div>
        <div className="lp-rise" style={{ ["--d" as string]: 0.24 }}>
          <HeroChat sectors={sectors.map((sector) => sector.id)} />
        </div>
      </section>

      <section className="lp-wrap sx-hub" aria-labelledby="sx-hub">
        <h2 id="sx-hub" className="lp-label">
          {t("hubListLabel")}
        </h2>
        <ul className="sx-hub-list">
          {sectors.map((sector) => (
            <li key={sector.id}>
              <Link href={sector.href} className="sx-hub-row">
                <h3>{sector.name}</h3>
                <p>{sector.summary}</p>
                <p className="sx-hub-for">
                  <span>{t("audienceLabel")}</span> {sector.audience}
                </p>
                <i aria-hidden="true">→</i>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <CTASection title={t("ctaTitle")} subtitle={t("ctaSubtitle")} />
    </LandingShell>
  );
}
