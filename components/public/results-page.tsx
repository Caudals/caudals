import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { VerdictMark } from "@/components/demo/verdict";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { MethodologyCta } from "@/components/methodology/methodology-cta";
import type { Locale } from "@/lib/i18n/config";
import { createTranslator, scopeTranslator } from "@/lib/i18n/messages";
import { METHODOLOGY_PATH } from "@/lib/methodology/content";
import type { PublicResultPage } from "@/lib/publication/contracts";
import { formatPublicDate, languageNames, sameDay, wholePercent } from "@/lib/publication/format";

const prose = "max-w-[42rem] text-[17px] leading-[1.7] text-[#3b3a36] text-pretty";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="space-y-4 border-t border-[#e9e7e1] pt-10">
      <h2 id={`${id}-title`} className="text-xl font-medium tracking-tight text-[#141413] text-balance">{title}</h2>
      {children}
    </section>
  );
}

/**
 * An opt-in public results page (launch L-31, spec P-23) in the Paper reading
 * layout: who chose to publish, when and what was tested, the sample, the
 * outcome counts with the share that matched the sources and its interval,
 * the review level, the methodology and the limits. It renders only the
 * frozen projection the founder published with the owner's written consent;
 * no question, answer, document or finding. No badge or seal: the result is
 * a number and a sentence, always next to its limits.
 */
export function PublicResultsPage({ locale, page }: { locale: Locale; page: PublicResultPage }) {
  const t = scopeTranslator(createTranslator(locale), "publicResults");
  const p = page.projection;
  const name = p.public_name;
  const date = (value: string) => formatPublicDate(locale, value);
  const percent = (share: number) => t("percent", { value: wholePercent(share) });
  const outcomes = [
    { verdict: "correct" as const, label: t("outcomeCorrect"), count: p.correct },
    { verdict: "partial" as const, label: t("outcomePartial"), count: p.partial },
    { verdict: "incorrect" as const, label: t("outcomeIncorrect"), count: p.incorrect },
    { verdict: "unscored" as const, label: t("outcomeNotScored"), count: p.not_scored },
  ];
  const review = p.expert_reviewers && p.expert_reviewed_on
    ? t("reviewExperts", { count: p.expert_reviewers, date: date(p.expert_reviewed_on) })
    : p.review_status === "reviewed" ? t("reviewReviewed") : t("reviewAutomatic");
  return (
    <div className="min-h-screen bg-background font-mk-sans text-[#141413] selection:bg-black selection:text-white [--bg:#fafaf8]">
      <Header />
      <main id="main" className="mx-auto w-full max-w-[1200px] px-[clamp(16px,4vw,40px)] pb-24 pt-12 lg:pt-20">
        <article className="mx-auto min-w-0 max-w-[46rem]" data-public-result={page.slug}>
          <header className="pb-10">
            <p className="text-sm font-medium text-[#6b6a63]">{t("kicker")}</p>
            <h1 className="mt-3 break-words text-[2.5rem] font-normal leading-[1.08] tracking-[-0.02em] text-balance sm:text-5xl">{name}</h1>
            <p className="mt-5 text-lg leading-relaxed text-[#3b3a36] text-pretty">{t("standfirst", { name })}</p>
            <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6b6a63]">
              <span>{sameDay(p.tested_from, p.tested_to) ? t("testedOn", { date: date(p.tested_to) }) : t("testedRange", { from: date(p.tested_from), to: date(p.tested_to) })}</span>
              <span>{t("published", { date: date(page.publishedAt) })}</span>
            </p>
          </header>

          <div className="space-y-10">
            <Section id="result" title={t("resultTitle")}>
              <p className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                <span className="text-[4rem] font-normal leading-none tracking-[-0.03em] tabular-nums" data-result-share>{percent(p.pass_rate)}</span>
                <span className="font-mk-serif text-xl leading-snug text-[#3b3a36] text-pretty">{t("resultSentence", { correct: p.correct, scored: p.scored })}</span>
              </p>
              <p className={prose}>
                {p.partial > 0 ? `${t("partialSentence", { partial: p.partial })} ` : ""}
                {p.interval_low !== undefined && p.interval_high !== undefined ? t("interval", { low: percent(p.interval_low), high: percent(p.interval_high) }) : null}
              </p>
              <table className="w-full max-w-[42rem] border-collapse text-left text-[15px] tabular-nums">
                <caption className="sr-only">{t("outcomesCaption")}</caption>
                <thead>
                  <tr className="border-b border-[#dcdad3]">
                    <th scope="col" className="py-3 pr-4 text-sm font-medium text-[#6b6a63]">{t("outcomeColumn")}</th>
                    <th scope="col" className="py-3 text-right text-sm font-medium text-[#6b6a63]">{t("countColumn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((row) => (
                    <tr key={row.verdict} className="border-b border-[#e9e7e1]">
                      <th scope="row" className="py-3 pr-4 font-medium text-[#141413]">
                        <span className="inline-flex items-center gap-2.5">
                          <VerdictMark verdict={row.verdict} className="h-[18px] w-[18px] shrink-0 text-[#141413]" />
                          {row.label}
                        </span>
                      </th>
                      <td className="py-3 text-right text-[#3b3a36]">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section id="scope" title={t("scopeTitle")}>
              <p className={prose}>{p.scope_summary}</p>
              {p.languages.length > 0 && <p className="text-sm text-[#6b6a63]">{t("languages", { languages: languageNames(locale, p.languages) })}</p>}
            </Section>

            <Section id="sample" title={t("sampleTitle")}>
              <p className={prose}>{t("sampleBody", { questions: p.questions, scored: p.scored })}</p>
            </Section>

            <Section id="review" title={t("reviewTitle")}>
              <p className={prose}>{review}</p>
            </Section>

            <Section id="methodology" title={t("methodTitle")}>
              <p className={prose}>{t("methodBody")}</p>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link href={METHODOLOGY_PATH} className="text-[#141413] underline decoration-[#b5b3ab] underline-offset-4 transition-colors hover:decoration-[#141413]">{t("methodLink")}</Link>
                {p.scorer_version ? <span className="text-[#6b6a63]">{t("methodVersion", { version: p.scorer_version })}</span> : null}
              </p>
            </Section>

            <Section id="limits" title={t("limitsTitle")}>
              <ul className="max-w-[42rem] list-disc space-y-3 pl-5 text-[17px] leading-[1.7] text-[#3b3a36] marker:text-[#b5b3ab]">
                <li className="pl-1 text-pretty">{t("limitSample")}</li>
                <li className="pl-1 text-pretty">{t("limitSources", { name })}</li>
                <li className="pl-1 text-pretty">{t("limitEvidence")}</li>
                <li className="pl-1 text-pretty">{t("limitConsent", { name })}</li>
              </ul>
              <p className="text-sm text-[#6b6a63]">{t("consentLine", { name, date: date(p.consented_on) })}</p>
            </Section>
          </div>

          <section aria-labelledby="results-cta" className="mt-16 rounded-[14px] border border-[#dcdad3] bg-white p-6 sm:p-8">
            <h2 id="results-cta" className="text-2xl font-normal tracking-[-0.01em] text-balance">{t("ctaTitle")}</h2>
            <p className="mt-3 max-w-[38rem] text-base leading-relaxed text-[#3b3a36] text-pretty">{t("ctaBody")}</p>
            <div className="mt-6">
              <MethodologyCta demo={t("ctaDemo")} contact={t("ctaContact")} call={t("ctaCall")} />
            </div>
          </section>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
