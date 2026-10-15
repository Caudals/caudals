"use client";

/**
 * In-app help (launch L-20, P-39): search the help articles, read one in
 * place, or reach Caudals. Opened from the account menu, ⌘K and the "?"
 * beside each step (which opens straight at its article). Articles live in
 * content/help and are listed in lib/evals/help/articles.ts.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarDays, Mail } from "lucide-react";
import { Action, ActionAnchor, ActionLink, SectionHeading } from "./primitives";
import { SidePanel } from "./overlays";
import { formatReviewDate, HelpBody, HelpListItemText, HelpSearchList, TextWithEmails, useHelpArticles, useHydrated, type HelpTarget } from "./help";
import { useWorkspace } from "./workspace-context";
import { helpArticlePath } from "@/lib/evals/help/articles";
import { getLocale, t, tv } from "@/lib/evals/messages/runtime";
import { marketingUrl, methodologyUrl } from "@/lib/evals/public-links";

const CONTACT_EMAIL = "hello@caudals.com";

/**
 * Email and call actions, shared by the panel and the help pages. The address
 * is kept out of Cloudflare's email obfuscation (see EmailText in ./help):
 * text in `email_off` markers, the mailto href once interactive.
 */
export function HelpContact() {
  const hydrated = useHydrated();
  return (
    <section aria-labelledby="help-contact">
      <SectionHeading id="help-contact" title={t("helpContactTitle")}>
        {t("helpContactBody")}
      </SectionHeading>
      <div className="p-toolbar">
        <ActionAnchor variant="secondary" size="sm" href={hydrated ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Caudals platform")}` : undefined}>
          <Mail aria-hidden="true" />
          <span>
            <TextWithEmails text={t("helpEmail")} />
          </span>
        </ActionAnchor>
        <ActionAnchor variant="secondary" size="sm" href={marketingUrl("/call", getLocale())} target="_blank" rel="noopener noreferrer">
          <CalendarDays aria-hidden="true" />
          {t("helpBookCall")}
        </ActionAnchor>
      </div>
      <p className="p-cell-meta p-help-method">
        <a href={methodologyUrl(getLocale())} target="_blank" rel="noopener noreferrer">
          {t("helpMethodology")}
          <ArrowUpRight aria-hidden="true" />
        </a>
      </p>
    </section>
  );
}

export function HelpPanel({ open, onOpenChange, target = null }: { open: boolean; onOpenChange: (open: boolean) => void; target?: HelpTarget | null }) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={t("help")} description={t("helpDescription")}>
      {/* The panel's content mounts on every opening, so it starts where it was asked to: at an article, or at the list. */}
      <HelpPanelBody target={target} onClose={() => onOpenChange(false)} />
    </SidePanel>
  );
}

function HelpPanelBody({ target, onClose }: { target: HelpTarget | null; onClose: () => void }) {
  const { withOrg } = useWorkspace();
  const { articles, error, retry } = useHelpArticles();
  const [current, setCurrent] = useState<HelpTarget | null>(target);

  const article = current && articles ? articles.find((item) => item.slug === current.slug) ?? null : null;

  // A link to a section scrolls the panel to it once the article is on screen.
  useEffect(() => {
    if (!article || !current?.section) return;
    const frame = requestAnimationFrame(() => document.getElementById(`help-panel-${current.section}`)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [article, current]);

  return (
    <>
      {article ? (
        <article className="p-help-article" aria-labelledby="help-article-title">
          <div className="p-row">
            <Action variant="ghost" size="sm" onClick={() => setCurrent(null)}>
              <ArrowLeft aria-hidden="true" />
              {t("helpAllArticles")}
            </Action>
          </div>
          <header className="p-help-article-head">
            <h3 id="help-article-title">{article.title}</h3>
            <p className="p-cell-meta">{tv("helpReviewed", { date: formatReviewDate(article.reviewed) })}</p>
          </header>
          <HelpBody key={article.slug} body={article.body} idPrefix="help-panel-" onOpenArticle={setCurrent} />
          <div className="p-row">
            <ActionLink variant="secondary" size="sm" href={withOrg(helpArticlePath(article.slug))} onClick={onClose}>
              {t("helpOpenPage")}
            </ActionLink>
          </div>
        </article>
      ) : (
        <HelpSearchList
          articles={articles}
          error={error}
          onRetry={retry}
          autoFocus
          renderItem={(item) => (
            <button type="button" className="p-help-item" onClick={() => setCurrent({ slug: item.slug })}>
              <HelpListItemText article={item} />
            </button>
          )}
        />
      )}
      {!article && (
        <p className="p-cell-meta">
          <Link href={withOrg("/workspace/help")} onClick={onClose}>
            {t("helpAllArticles")}
          </Link>
        </p>
      )}
      <HelpContact />
    </>
  );
}
