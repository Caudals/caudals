"use client";

/**
 * The help centre as pages (launch L-20): `/workspace/help` lists and searches
 * every article, `/workspace/help/[slug]` shows one. Same parts as the panel.
 */
import Link from "next/link";
import { PageHeading, SectionHeading } from "./primitives";
import { formatReviewDate, HelpBody, HelpListItemText, HelpSearchList, useHelpArticles } from "./help";
import { HelpContact } from "./help-panel";
import { usePageCrumb, useWorkspace } from "./workspace-context";
import { helpArticlePath, type HelpArticle, type HelpSlug } from "@/lib/evals/help/articles";
import { t, tv } from "@/lib/evals/messages/runtime";

export function HelpCentre() {
  const { withOrg } = useWorkspace();
  const { articles, error, retry } = useHelpArticles();
  return (
    <div className="p-help-page">
      <PageHeading title={t("help")}>{t("helpCentreDescription")}</PageHeading>
      <HelpSearchList
        articles={articles}
        error={error}
        onRetry={retry}
        autoFocus
        renderItem={(article) => (
          <Link className="p-help-item" href={withOrg(helpArticlePath(article.slug))}>
            <HelpListItemText article={article} />
          </Link>
        )}
      />
      <HelpContact />
    </div>
  );
}

export function HelpArticlePage({ article, related }: { article: HelpArticle; related: Array<{ slug: HelpSlug; title: string; summary: string }> }) {
  const { withOrg } = useWorkspace();
  usePageCrumb(article.title);
  // No in-page back link: the breadcrumb (Help › article) carries the way back (DESIGN §9, R3).
  // The article reads in a 70ch column; the help centre's list keeps the wider one.
  return (
    <div className="p-help-page" data-reading="true">
      <PageHeading title={article.title} meta={<span>{tv("helpReviewed", { date: formatReviewDate(article.reviewed) })}</span>}>
        {article.summary}
      </PageHeading>
      <HelpBody body={article.body} />
      {related.length > 0 && (
        <section aria-labelledby="help-related">
          <SectionHeading id="help-related" title={t("helpRelated")} />
          <ul className="p-help-list">
            {related.map((item) => (
              <li key={item.slug}>
                <Link className="p-help-item" href={withOrg(helpArticlePath(item.slug))}>
                  <span className="p-help-item-title">{item.title}</span>
                  <span className="p-help-item-summary">{item.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <HelpContact />
    </div>
  );
}
