"use client";

import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { CTASection } from "@/components/landing/cta";
import { ExpertNetwork } from "@/components/landing/diagrams/expert-network";
import { FailureModes } from "@/components/landing/diagrams/failure-modes";
import { HeroChat } from "@/components/landing/hero-chat";
import { LandingShell } from "@/components/landing/landing-shell";
import { splitMarked } from "@/components/landing/marks";
import { Breadcrumbs } from "@/components/sectors/breadcrumbs";
import { EXPERT_ROLE_ICONS } from "@/components/sectors/expert-icons";
import { useTranslations } from "@/lib/i18n/context";
import { SECTORS_HUB_PATH, type SectorId } from "@/lib/public/sectors";
import type { SectorCopy } from "@/lib/sectors/content";

export type RelatedSector = { id: SectorId; name: string; summary: string; href: string };

type SectorPageClientProps = {
  sectorId: SectorId;
  copy: SectorCopy;
  related: readonly RelatedSector[];
};

/**
 * One sector's page, in the landing's Paper language: the sector's own
 * conversation in the hero, what we test, where assistants in the sector go
 * wrong, who writes the answer key, questions buyers ask, and the way out to
 * the free diagnostic with the sector already chosen on the form.
 */
export function SectorPageClient({ sectorId, copy, related }: SectorPageClientProps) {
  const t = useTranslations("sectors");
  const tHero = useTranslations("hero");
  const headline = splitMarked(copy.headline);
  const diagnosticHref = `/contact?offer=reality-check&sector=${sectorId}`;

  const steps = [
    {
      id: "tested",
      title: copy.tested.title,
      description: copy.tested.description,
      figure: (
        <div className="sx-lists">
          <div>
            <p className="lp-label">{t("systemsLabel")}</p>
            <ul>
              {copy.tested.systems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="lp-label">{t("topicsLabel")}</p>
            <ul>
              {copy.tested.topics.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: "failures",
      title: copy.failures.title,
      description: copy.failures.description,
      figure: <FailureModes examples={copy.failures.examples} />,
    },
    {
      id: "experts",
      title: copy.experts.title,
      description: copy.experts.description,
      figure: (
        <ExpertNetwork
          roles={copy.experts.roles.map(({ label, icon }) => ({
            label,
            icon: EXPERT_ROLE_ICONS[icon],
          }))}
          datasets={copy.experts.datasets}
        />
      ),
    },
  ];

  return (
    <LandingShell>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("hub"), href: SECTORS_HUB_PATH },
          { label: copy.name },
        ]}
      />

      <section className="lp-wrap lp-hero sx-hero">
        <div>
          <p className="lp-label lp-rise">{copy.audience}</p>
          <h1 className="lp-h1 sx-h1 lp-rise" style={{ ["--d" as string]: 0.04 }}>
            {headline.before}
            {headline.marked ? <em>{headline.marked}</em> : null}
            {headline.after}
          </h1>
          <p className="lp-sub lp-rise" style={{ ["--d" as string]: 0.08 }}>
            {copy.subtitle}
          </p>
          <div className="lp-hero-act lp-rise" style={{ ["--d" as string]: 0.16 }}>
            <Link href={diagnosticHref} className="lp-btn">
              {tHero("primaryCta")}
              <span className="lp-arr" aria-hidden="true">
                →
              </span>
            </Link>
            <Link href="/call" className="lp-hero-call">
              {tHero("secondaryCta")}
            </Link>
          </div>
        </div>
        <div className="lp-rise" style={{ ["--d" as string]: 0.24 }}>
          <HeroChat sectors={[sectorId]} />
        </div>
      </section>

      <section className="lp-wrap lp-problem">
        <p className="lp-rv">
          {copy.stakes.lead} <span className="solution">{copy.stakes.solution}</span>
        </p>
      </section>

      <section className="lp-wrap lp-steps sx-steps">
        {steps.map(({ id, title, description, figure }, index) => (
          <article key={id} className="lp-step" aria-labelledby={`sx-${id}`}>
            <p className="lp-step-num" aria-hidden="true">
              {index + 1}
            </p>
            <div className="lp-step-body lp-rv">
              <h2 id={`sx-${id}`} className="lp-h2">
                {title}
              </h2>
              <p className="lp-lede">{description}</p>
            </div>
            <div className="lp-step-fig lp-rv">{figure}</div>
          </article>
        ))}
      </section>

      <section className="lp-wrap sx-faq" aria-labelledby="sx-faq">
        <h2 id="sx-faq" className="lp-h2">
          {t("faqTitle")}
        </h2>
        <div className="sx-faq-list">
          {copy.faq.map(({ q, a }) => (
            <details key={q}>
              <summary>
                <h3>{q}</h3>
                <span className="sx-faq-mark" aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-wrap sx-related" aria-labelledby="sx-related">
        <h2 id="sx-related" className="lp-h2">
          {t("relatedTitle")}
        </h2>
        <ul className="sx-cards">
          {related.map((sector) => (
            <li key={sector.id}>
              <Link href={sector.href} className="sx-card">
                <b>{sector.name}</b>
                <span>{sector.summary}</span>
                <i aria-hidden="true">→</i>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <CTASection title={t("ctaTitle")} subtitle={t("ctaSubtitle")} primaryHref={diagnosticHref} />
    </LandingShell>
  );
}
