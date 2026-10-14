import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { MethodologyCta } from "@/components/methodology/methodology-cta";
import type { Locale } from "@/lib/i18n/config";
import { createTranslator, scopeTranslator } from "@/lib/i18n/messages";
import { splitMarked } from "@/lib/marked-text";
import { METHODOLOGY_PATH } from "@/lib/methodology/content";
import { MIN_COHORT, MIN_SCORED_PER_SYSTEM, type PublicSectorIndex } from "@/lib/publication/contracts";
import { formatPublicDate, quarterParts } from "@/lib/publication/format";

const prose = "max-w-[42rem] text-[17px] leading-[1.7] text-[#3b3a36] text-pretty";
const list = "max-w-[42rem] list-disc space-y-3 pl-5 text-[17px] leading-[1.7] text-[#3b3a36] marker:text-[#b5b3ab]";

/**
 * One quarter of the anonymous sector index (launch L-31, spec P-53, D-16) in
 * the Paper reading layout. It renders only edition rows that carry a
 * recorded legal sign-off and a cohort of at least ten systems: sector,
 * number of systems, the median share of answers that matched the sources,
 * the middle half of systems and the pooled outcome shares. No company,
 * product, assistant, website or question appears, and no best or worst
 * system. The method is published on the page.
 */
export function SectorIndexPage({ locale, index }: { locale: Locale; index: PublicSectorIndex }) {
  const translate = createTranslator(locale);
  const t = scopeTranslator(translate, "sectorIndex");
  const quarter = t("quarter", quarterParts(index.quarter));
  const percent = (value: number) => t("percent", { value });
  const { before, marked, after } = splitMarked(t("title"));
  const published = index.rows.map((row) => row.publishedAt).sort().at(-1)!;
  const legal = index.rows.map((row) => row.legalSignedOn).sort().at(-1)!;
  const version = index.rows[0]?.methodologyVersion;
  const sector = (id: string) => translate(`sectorIndex.sectorNames.${id}` as Parameters<typeof translate>[0]);
  return (
    <div className="min-h-screen bg-background font-mk-sans text-[#141413] selection:bg-black selection:text-white [--bg:#fafaf8]">
      <Header />
      <main id="main" className="mx-auto w-full max-w-[1200px] px-[clamp(16px,4vw,40px)] pb-24 pt-12 lg:pt-20">
        <article className="mx-auto min-w-0 max-w-[52rem]" data-sector-index={index.quarter}>
          <header className="border-b border-[#e9e7e1] pb-10">
            <p className="text-sm font-medium text-[#6b6a63]">{t("kicker")}</p>
            <h1 className="mt-3 text-[2.5rem] font-normal leading-[1.08] tracking-[-0.02em] text-balance sm:text-5xl">
              {before}
              {marked ? <em className="font-mk-serif italic">{marked}</em> : null}
              {after}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[#3b3a36] text-pretty">{t("standfirst", { quarter })}</p>
            <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6b6a63]">
              <span>{t("published", { date: formatPublicDate(locale, published) })}</span>
              <span>{t("legalReview", { date: formatPublicDate(locale, legal) })}</span>
            </p>
          </header>

          <section aria-labelledby="sector-table-title" className="pt-6 md:pt-8">
            <h2 id="sector-table-title" className="sr-only">{t("tableCaption", { quarter })}</h2>
            <div className="hidden md:block">
              <table className="w-full border-collapse text-left text-[15px] tabular-nums">
                <caption className="sr-only">{t("tableCaption", { quarter })}</caption>
                <thead>
                  <tr className="border-b border-[#dcdad3]">
                    {[t("colSector"), t("colSystems"), t("colMedian"), t("colMiddle"), t("colAnswers"), t("colPooled")].map((column, index) => (
                      <th key={column} scope="col" className={`py-3 pr-4 align-bottom text-sm font-medium text-[#6b6a63] ${index ? "text-right" : ""}`}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {index.rows.map((row) => (
                    <tr key={row.sector} className="border-b border-[#e9e7e1] align-top" data-sector={row.sector}>
                      <th scope="row" className="py-4 pr-4 font-medium text-[#141413]">{sector(row.sector)}</th>
                      <td className="py-4 pr-4 text-right text-[#3b3a36]">{row.cohortSize}</td>
                      <td className="py-4 pr-4 text-right text-[#141413]">{percent(row.aggregates.median_pass)}</td>
                      <td className="py-4 pr-4 text-right whitespace-nowrap text-[#3b3a36]">{t("range", { low: percent(row.aggregates.p25_pass), high: percent(row.aggregates.p75_pass) })}</td>
                      <td className="py-4 pr-4 text-right text-[#3b3a36]">{row.aggregates.answers_scored}</td>
                      <td className="py-4 text-right whitespace-nowrap text-[#3b3a36]">{t("pooled", { correct: percent(row.aggregates.correct_share), partial: percent(row.aggregates.partial_share), incorrect: percent(row.aggregates.incorrect_share) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[#e9e7e1] border-b border-[#e9e7e1] md:hidden">
              {index.rows.map((row) => (
                <li key={row.sector} className="py-5" data-sector={row.sector}>
                  <p className="text-base font-medium text-[#141413]">{sector(row.sector)}</p>
                  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[15px] tabular-nums">
                    <dt className="text-[#6b6a63]">{t("colSystems")}</dt>
                    <dd className="text-right text-[#3b3a36]">{row.cohortSize}</dd>
                    <dt className="text-[#6b6a63]">{t("colMedian")}</dt>
                    <dd className="text-right text-[#141413]">{percent(row.aggregates.median_pass)}</dd>
                    <dt className="text-[#6b6a63]">{t("colMiddle")}</dt>
                    <dd className="text-right whitespace-nowrap text-[#3b3a36]">{t("range", { low: percent(row.aggregates.p25_pass), high: percent(row.aggregates.p75_pass) })}</dd>
                    <dt className="text-[#6b6a63]">{t("colAnswers")}</dt>
                    <dd className="text-right text-[#3b3a36]">{row.aggregates.answers_scored}</dd>
                    <dt className="text-[#6b6a63]">{t("colPooled")}</dt>
                    <dd className="text-right whitespace-nowrap text-[#3b3a36]">{t("pooled", { correct: percent(row.aggregates.correct_share), partial: percent(row.aggregates.partial_share), incorrect: percent(row.aggregates.incorrect_share) })}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-12 space-y-10">
            <section id="method" aria-labelledby="method-title" className="space-y-4 border-t border-[#e9e7e1] pt-10">
              <h2 id="method-title" className="text-xl font-medium tracking-tight text-balance">{t("methodTitle")}</h2>
              <ul className={list}>
                <li className="pl-1 text-pretty">{t("methodInputs")}</li>
                <li className="pl-1 text-pretty">{t("methodOnce", { minScored: MIN_SCORED_PER_SYSTEM })}</li>
                <li className="pl-1 text-pretty">{t("methodCohort", { minCohort: MIN_COHORT })}</li>
                <li className="pl-1 text-pretty">{t("methodFigures")}</li>
                <li className="pl-1 text-pretty">{t("methodNames")}</li>
                <li className="pl-1 text-pretty">{t("methodGrading")}</li>
              </ul>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link href={METHODOLOGY_PATH} className="text-[#141413] underline decoration-[#b5b3ab] underline-offset-4 transition-colors hover:decoration-[#141413]">{t("methodLink")}</Link>
                {version ? <span className="text-[#6b6a63]">{t("methodVersion", { version })}</span> : null}
              </p>
            </section>
            <section id="limits" aria-labelledby="limits-title" className="space-y-4 border-t border-[#e9e7e1] pt-10">
              <h2 id="limits-title" className="text-xl font-medium tracking-tight text-balance">{t("limitsTitle")}</h2>
              <ul className={list}>
                <li className="pl-1 text-pretty">{t("limitSample")}</li>
                <li className="pl-1 text-pretty">{t("limitSources")}</li>
                <li className="pl-1 text-pretty">{t("limitEvidence")}</li>
              </ul>
            </section>
          </div>

          <section aria-labelledby="index-cta" className="mt-16 rounded-[14px] border border-[#dcdad3] bg-white p-6 sm:p-8">
            <h2 id="index-cta" className="text-2xl font-normal tracking-[-0.01em] text-balance">{translate("publicResults.ctaTitle")}</h2>
            <p className={`mt-3 ${prose}`}>{translate("publicResults.ctaBody")}</p>
            <div className="mt-6">
              <MethodologyCta demo={translate("publicResults.ctaDemo")} contact={translate("publicResults.ctaContact")} call={translate("publicResults.ctaCall")} />
            </div>
          </section>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
