import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { ClientMessages } from "@/components/i18n/client-messages";
import { CTASection } from "@/components/landing/cta";
import { DemoCtaButton } from "@/components/landing/demo-cta";
import { HeroChat } from "@/components/landing/hero-chat";
import { heroChatMessages } from "@/components/landing/hero-chat-data";
import { LandingShell } from "@/components/landing/landing-shell";
import { Breadcrumbs } from "@/components/sectors/breadcrumbs";
import type { RelatedSector } from "@/components/sectors/sector-page";
import type { Locale } from "@/lib/i18n/config";
import { createScopedTranslator } from "@/lib/i18n/messages";
import { splitMarked } from "@/lib/marked-text";

type HubSector = RelatedSector & { audience: string };

/** The sectors hub: one line per sector and a way into each page. Rendered on the server (launch L-24b). */
export function SectorsHub({
  locale,
  demoPublic,
  sectors,
}: {
  locale: Locale;
  /** `DEMO_PUBLIC` (`lib/public/front-door.ts`), read by the page on the server. */
  demoPublic: boolean;
  sectors: readonly HubSector[];
}) {
  const t = createScopedTranslator(locale, "sectors");
  const tHero = createScopedTranslator(locale, "hero");
  const headline = splitMarked(t("hubHeadline"));

  return (
    <LandingShell>
      <Breadcrumbs locale={locale} items={[{ label: t("home"), href: "/" }, { label: t("hub") }]} />

      <section className="lp-wrap lp-hero sx-hero">
        <div>
          <h1 className="lp-h1 sx-h1 lp-lift">
            {headline.before}
            {headline.marked ? <em>{headline.marked}</em> : null}
            {headline.after}
          </h1>
          <p className="lp-sub lp-lift" style={{ ["--d" as string]: 0.08 }}>
            {t("hubSubtitle")}
          </p>
          <div className="lp-hero-act lp-rise" style={{ ["--d" as string]: 0.16 }}>
            {demoPublic ? (
              <DemoCtaButton />
            ) : (
              <Link href="/contact?offer=reality-check" className="lp-btn">
                {tHero("primaryCta")}
                <span className="lp-arr" aria-hidden="true">
                  →
                </span>
              </Link>
            )}
          </div>
        </div>
        <div className="lp-rise" style={{ ["--d" as string]: 0.24 }}>
          <ClientMessages locale={locale} groups={heroChatMessages(sectors.map((sector) => sector.id))}>
            <HeroChat sectors={sectors.map((sector) => sector.id)} />
          </ClientMessages>
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

      <CTASection locale={locale} demoPublic={demoPublic} title={t("ctaTitle")} subtitle={t("ctaSubtitle")} />
    </LandingShell>
  );
}
