"use client";

/**
 * "Send to my vendor" (launch P-54, spec §4.19): the page a vendor opens from
 * a fix-list link, in the Paper language. A "what this is" header, the fix
 * list ("Fix these first", P-18) with the answers behind each fix, and the
 * partner programme invitation (L-28). The link carries the fix list and its
 * evidence only; nothing else of the report reaches this page. The owner's
 * dialog previews the same view before a link exists.
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight, Download, FileText } from "lucide-react";
import { VerdictMark } from "@/components/demo/verdict";
import type { Verdict } from "@/lib/demo/judge";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/en";
import { answerCount, buildFixes, fixesCsv, fixesMarkdown, type Fix, type FixEvidence } from "@/lib/evals/reports/fixes";
import { isFixListShare, type FixListShare } from "@/lib/evals/reports/fix-list-share";
import { fill, summaryCopy } from "@/lib/evals/reports/summary-copy";
import { reportDate } from "@/lib/evals/reports/i18n";
import { reportDownloadName } from "@/lib/evals/reports/file-name";
import { vendorReferralLinks } from "@/lib/evals/reports/referral";
import { methodologyUrl } from "@/lib/evals/public-links";
import { setInterfaceLocale } from "./locale";
import { openSharePage, readShareToken } from "./share-token";
import "./vendor-fix-list.css";

const VERDICT: Record<string, { mark: Verdict; label: MessageKey }> = {
  partially_correct: { mark: "partial", label: "labelPartiallyCorrect" },
  not_answered: { mark: "no_answer", label: "labelNotAnswered" },
  incorrect: { mark: "incorrect", label: "labelIncorrect" },
};
const verdictOf = (result: FixEvidence) =>
  VERDICT[result.label ?? ""] ?? (result.outcome === "partial" ? VERDICT.partially_correct : VERDICT.incorrect);
const severityLabel = (severity: FixEvidence["severity"]) => t(`vendorSeverity_${severity}` as MessageKey);
const FACT: Record<string, MessageKey> = { present: "vendorFactPresent", missing: "vendorFactMissing", contradicted: "vendorFactContradicted" };

/** Save text built in the browser as a file. */
function saveText(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ---------------------------------------------------------------- frame --- */

/** The Paper frame: the wordmark, one line of context and the language. No navigation. */
export function VendorFrame({ children }: { children: ReactNode }) {
  const locale = getLocale();
  return (
    <div className="vf vf-page">
      <header className="vf-bar">
        <div className="vf-wrap vf-bar-inner">
          <span className="vf-brand">
            <Image src="/caudals_logo_black.svg" alt="" width={24} height={24} priority />
            Caudals
          </span>
          <span className="vf-context">{t("vendorContext")}</span>
          <span className="vf-lang" role="group" aria-label={t("language")}>
            {(["en", "es"] as const).map((value) => (
              <button key={value} type="button" lang={value} aria-pressed={locale === value} onClick={() => locale !== value && setInterfaceLocale(value)}>
                {t(value === "en" ? "languageEnglish" : "languageSpanish")}
              </button>
            ))}
          </span>
        </div>
      </header>
      <main id="p-main" className="vf-wrap">
        <div className="vf-main">{children}</div>
      </main>
      <footer className="vf-wrap vf-foot">{t("vendorFooter")}</footer>
    </div>
  );
}

/* ----------------------------------------------------------------- page --- */

type Exchange = { data: unknown; meta?: { share?: { expiresAt?: string | null } | null; referral?: unknown } };

/** `/share/fixes`: reads the link's token, opens the fix list, and moves a full report's link to `/share`. */
export function VendorFixListPage({ marketingOrigin = "https://caudals.com" }: { marketingOrigin?: string }) {
  const token = useSyncExternalStore(
    () => () => {},
    readShareToken,
    () => null,
  );
  const [state, setState] = useState<{ data: FixListShare; expiresAt: string | null; referral: string | null } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!token) return;
    history.replaceState(null, "", location.pathname);
    void fetch("/api/evals/v1/share/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as Exchange;
      })
      .then((body) => {
        if (!isFixListShare(body.data)) return openSharePage("/share", token);
        const referral = typeof body.meta?.referral === "string" && /^sr-[0-9a-f]{12}$/.test(body.meta.referral) ? body.meta.referral : null;
        setState({ data: body.data, expiresAt: body.meta?.share?.expiresAt ?? null, referral });
      })
      .catch(() => setError(true));
  }, [token]);
  return (
    <VendorFrame>
      {!token || error ? (
        <div className="vf-state" role="alert">
          <h1>{t("vendorUnavailableTitle")}</h1>
          <p>{t("vendorUnavailable")}</p>
        </div>
      ) : !state ? (
        <p className="vf-state" role="status">
          <span className="vf-spinner" aria-hidden="true" />
          {t("vendorLoading")}
        </p>
      ) : (
        <VendorFixList data={state.data} expiresAt={state.expiresAt} referral={state.referral} marketingOrigin={marketingOrigin} />
      )}
    </VendorFrame>
  );
}

/* ----------------------------------------------------------------- view --- */

/**
 * The fix list and its evidence. The fixes are rebuilt from the shared
 * answers in the reader's language; the link carries only the answers that
 * make them up, so they are the owner's fixes.
 */
export function VendorFixList({
  data,
  expiresAt = null,
  referral = null,
  marketingOrigin = "https://caudals.com",
  preview = false,
}: {
  data: FixListShare;
  expiresAt?: string | null;
  referral?: string | null;
  marketingOrigin?: string;
  /** The owner's preview: the downloads and links are shown but not followed. */
  preview?: boolean;
}) {
  const locale = getLocale();
  const copy = summaryCopy(locale);
  const fixes = useMemo(() => buildFixes(data.results, locale), [data.results, locale]);
  const byId = useMemo(() => new Map(data.results.map((result) => [result.assessment_id, result])), [data.results]);
  const name = data.system.name.trim();
  const date = reportDate(data.created_at, locale);
  const links = vendorReferralLinks(marketingOrigin, locale, referral);
  const file = (type: string) => reportDownloadName(data.report_revision_id, type, `${name} fixes`.trim(), data.created_at);
  const answers = fixes.reduce((sum, fix) => sum + fix.assessment_ids.length, 0);
  // The owner's preview shows the invitation without following it.
  const inert = preview ? { tabIndex: -1, onClick: (event: { preventDefault: () => void }) => event.preventDefault() } : {};

  return (
    <article data-vendor-fix-list>
      <header className="vf-head" data-vendor-intro>
        <p className="vf-kicker">{t("vendorKicker")}</p>
        <h1 className="vf-title">{name ? tv("vendorTitle", { system: name }) : t("vendorTitleNoName")}</h1>
        <p className="vf-standfirst">{t("vendorStandfirst")}</p>
        <dl className="vf-facts">
          <div>
            <dt>{t("vendorFactTested")}</dt>
            <dd>{date}</dd>
          </div>
          <div>
            <dt>{t("vendorFactFixes")}</dt>
            <dd data-fix-count>{fixes.length}</dd>
          </div>
          <div>
            <dt>{t("vendorFactAnswers")}</dt>
            <dd data-answer-count>{answers}</dd>
          </div>
          <div>
            <dt>{t("vendorFactGrades")}</dt>
            <dd>{data.review_status === "reviewed" ? t("vendorGradesReviewed") : t("vendorGradesPreliminary")}</dd>
          </div>
          {expiresAt && (
            <div>
              <dt>{t("vendorFactExpires")}</dt>
              <dd>{reportDate(expiresAt, locale)}</dd>
            </div>
          )}
        </dl>
        <div className="vf-notes">
          <p>{t("vendorHypotheses")}</p>
          <p>
            {t("vendorScopeNote")}{" "}
            <a className="vf-link" href={methodologyUrl(locale)} target="_blank" rel="noopener noreferrer" data-methodology-link>
              {t("helpMethodology")}
            </a>
          </p>
        </div>
        <div className="vf-actions">
          <button type="button" className="vf-pill vf-pill-ghost" disabled={preview}
            onClick={() => saveText(file("text/markdown"), fixesMarkdown({ system: data.system, results: data.results }, fixes, locale, date), "text/markdown;charset=utf-8")}>
            <FileText aria-hidden="true" />
            {t("vendorDownloadMarkdown")}
          </button>
          <button type="button" className="vf-pill vf-pill-ghost" disabled={preview}
            onClick={() => saveText(file("text/csv"), fixesCsv(data.results, fixes), "text/csv;charset=utf-8")}>
            <Download aria-hidden="true" />
            {t("vendorDownloadCsv")}
          </button>
        </div>
      </header>

      <section className="vf-section" aria-labelledby="vf-fixes-title" data-vendor-fixes>
        <h2 id="vf-fixes-title">{copy.fixesTitle}</h2>
        <p className="vf-lead">{fixes.length ? t("vendorFixesLead") : copy.fixesNone}</p>
        <ol className="vf-fixes">
          {fixes.map((fix) => (
            <FixItem key={fix.id} fix={fix} results={fix.assessment_ids.map((id) => byId.get(id)).filter((item): item is FixEvidence => !!item)} />
          ))}
        </ol>
      </section>

      <aside className="vf-cta" aria-labelledby="vf-cta-title" data-vendor-cta>
        <h2 id="vf-cta-title">{t("vendorCtaTitle")}</h2>
        <p>{t("vendorCtaBody")}</p>
        <div className="vf-actions">
          <a className="vf-pill" href={links.demo} target="_blank" rel="noopener" {...inert}>
            {t("vendorCtaDemo")}
            <ArrowUpRight aria-hidden="true" />
          </a>
          <a className="vf-pill vf-pill-ghost" href={links.partner} target="_blank" rel="noopener" {...inert}>
            {t("vendorCtaPartner")}
          </a>
        </div>
        <p className="vf-cta-note">{t("vendorCtaNote")}</p>
      </aside>
    </article>
  );
}

function FixItem({ fix, results }: { fix: Fix; results: FixEvidence[] }) {
  const locale = getLocale();
  const copy = summaryCopy(locale);
  return (
    <li className="vf-fix" id={`fix-${fix.rank}`} data-fix={fix.rank}>
      <span className="vf-index" aria-hidden="true">{fix.rank}</span>
      <div>
        <h3>{fix.title}</h3>
        <p className="vf-meta">
          <span className="vf-tag" data-strong={fix.severity === "critical" || fix.severity === "high" ? "true" : undefined}>{severityLabel(fix.severity)}</span>
          <span>{answerCount(fix.assessment_ids.length, locale)}</span>
          {fix.critical > 0 && <span>{fix.critical === 1 ? t("vendorCriticalOne") : tv("vendorCriticalMany", { n: fix.critical })}</span>}
        </p>
        <p className="vf-basis" data-basis>{fix.basis}</p>
        <p className="vf-source">{fix.source ? fill(copy.fixSource, { source: fix.source }) : copy.fixNoSource}</p>
        <div className="vf-todo">
          <span className="vf-label">{copy.fixDo}</span>
          <p>{fix.action}</p>
        </div>
        <h4 className="vf-evidence-title">{t("vendorEvidenceTitle")}</h4>
        <div className="vf-results">
          {results.map((result, index) => (
            <EvidenceRow key={result.assessment_id} result={result} number={`${fix.rank}.${index + 1}`} />
          ))}
        </div>
      </div>
    </li>
  );
}

function EvidenceRow({ result, number }: { result: FixEvidence; number: string }) {
  const copy = summaryCopy(getLocale());
  const verdict = verdictOf(result);
  const facts = (result.key_facts ?? []).filter((fact) => fact.status && fact.status !== "present");
  return (
    <details className="vf-result" id={`answer-${number.replace(".", "-")}`} data-evidence={result.assessment_id}>
      <summary>
        <span className="vf-index">{number}</span>
        <span className="vf-result-q">{result.input || result.title}</span>
        <span className="vf-result-meta">
          <span className="vf-verdict">
            <VerdictMark verdict={verdict.mark} className="vf-mark" />
            {t(verdict.label)}
          </span>
          <span>{severityLabel(result.severity)}</span>
        </span>
      </summary>
      <div className="vf-result-body">
        <div className="vf-sheet">
          <span className="vf-label">{copy.markdownAnswer}</span>
          <p>{result.output || "—"}</p>
        </div>
        {result.expected ? (
          <div>
            <span className="vf-label">{copy.markdownExpected}</span>
            <p>{result.expected}</p>
          </div>
        ) : null}
        {result.rationale ? (
          <div>
            <span className="vf-label">{t("vendorWhy")}</span>
            <p>{result.rationale}</p>
          </div>
        ) : null}
        {facts.length ? (
          <div>
            <span className="vf-label">{t("vendorKeyFacts")}</span>
            <ul className="vf-list">
              {facts.map((fact, index) => (
                <li key={index}>
                  <span>{fact.fact}</span>
                  <span>{t(FACT[fact.status ?? ""] ?? "vendorFactMissing")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.contradictions?.length ? (
          <div>
            <span className="vf-label">{t("vendorContradictions")}</span>
            <ul className="vf-list">
              {result.contradictions.map((item, index) => (
                <li key={index}>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.unsupported_claims?.length ? (
          <div>
            <span className="vf-label">{t("vendorUnsupported")}</span>
            <ul className="vf-list">
              {result.unsupported_claims.map((item, index) => (
                <li key={index}>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.source_excerpts?.map((excerpt, index) => (
          <figure key={index}>
            <span className="vf-label">{copy.markdownFromSource}</span>
            <blockquote className="vf-quote">
              {excerpt.excerpt}
              {excerpt.title ? <cite>{excerpt.title}</cite> : null}
            </blockquote>
          </figure>
        ))}
      </div>
    </details>
  );
}
