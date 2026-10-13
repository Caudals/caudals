"use client";

/**
 * Help centre parts shared by the help panel and the help pages (launch L-20):
 * the article body (the Markdown subset in lib/evals/help/markdown.ts rendered
 * with the platform kit), the searchable article list, and the contextual "?"
 * link that opens an article beside the step it explains.
 */
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { useWorkspace } from "./workspace-context";
import { Action, SearchInput, Status } from "./primitives";
import { CONTEXT_HELP, helpArticlePath, loadHelpIndex, searchHelp, type HelpArticle, type HelpContextKey, type HelpIndex, type HelpSlug } from "@/lib/evals/help/articles";
import { parseMarkdown, type Inline } from "@/lib/evals/help/markdown";
import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/en";

export type HelpTarget = { slug: HelpSlug; section?: string };

/* --------------------------------------------------------------- context --- */

const OpenHelpContext = createContext<((target?: HelpTarget) => void) | null>(null);

/** Provided by the shell: opens the help panel, optionally at one article. */
export function OpenHelpProvider({ open, children }: { open: (target?: HelpTarget) => void; children: ReactNode }) {
  return <OpenHelpContext.Provider value={open}>{children}</OpenHelpContext.Provider>;
}

export function useOpenHelp() {
  return useContext(OpenHelpContext);
}

/** Links that keep the selected workspace. The workspace goes in the query, before any #section. */
function useWithOrg() {
  const { withOrg } = useWorkspace();
  return (href: string) => {
    const [path, hash] = href.split("#");
    return `${withOrg(path)}${hash ? `#${hash}` : ""}`;
  };
}

const LINK_LABEL: Record<HelpContextKey, MessageKey> = {
  connectWebsite: "helpLinkConnectWebsite",
  connectApi: "helpLinkConnectApi",
  connectUpload: "helpLinkConnectUpload",
  connectPrivate: "helpLinkConnectPrivate",
  sources: "helpLinkSources",
  prepare: "helpLinkPrepare",
  run: "helpLinkRun",
  results: "helpLinkResults",
  monitoring: "helpLinkMonitoring",
  billing: "helpLinkBilling",
};

/**
 * The contextual "?" beside a step. It opens the article in the help panel;
 * without the shell (or with a modifier key) it is an ordinary link to the
 * article's own page.
 */
export function HelpLink({ topic }: { topic: HelpContextKey }) {
  const open = useOpenHelp();
  const withOrg = useWithOrg();
  const target: HelpTarget = CONTEXT_HELP[topic];
  const label = t(LINK_LABEL[topic]);
  return (
    <a
      className="p-help-link"
      href={withOrg(helpArticlePath(target.slug, target.section))}
      aria-label={label}
      title={label}
      data-help-topic={topic}
      onClick={(event) => {
        if (!open || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        open(target);
      }}
    >
      <CircleHelp aria-hidden="true" />
    </a>
  );
}

/* ------------------------------------------------------------------ data --- */

/** The articles in the interface language, loaded once per page. */
export function useHelpArticles() {
  const [state, setState] = useState<{ index: HelpIndex | null; error: boolean }>({ index: null, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    loadHelpIndex(getLocale())
      .then((index) => live && setState({ index, error: false }))
      .catch(() => live && setState({ index: null, error: true }));
    return () => {
      live = false;
    };
  }, [attempt]);
  return { articles: state.index?.articles ?? null, error: state.error, retry: () => setAttempt((value) => value + 1) };
}

export function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat(getLocale() === "es" ? "es-ES" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

/* ------------------------------------------------------------------ body --- */

type BodyProps = {
  body: string;
  /** Prefix for heading ids, so an article in the panel never clashes with the page under it. */
  idPrefix?: string;
  /** Opens another article in place (the panel); without it, article links navigate. */
  onOpenArticle?: (target: HelpTarget) => void;
};

function InlineNodes({ nodes, link }: { nodes: Inline[]; link: (href: string, children: ReactNode, key: number) => ReactNode }) {
  return (
    <>
      {nodes.map((node, index) =>
        node.kind === "text" ? (
          <Fragment key={index}>{node.text}</Fragment>
        ) : node.kind === "code" ? (
          <code key={index} className="p-code">
            {node.text}
          </code>
        ) : node.kind === "strong" ? (
          <strong key={index}>
            <InlineNodes nodes={node.children} link={link} />
          </strong>
        ) : node.kind === "em" ? (
          <em key={index}>
            <InlineNodes nodes={node.children} link={link} />
          </em>
        ) : (
          link(node.href, <InlineNodes nodes={node.children} link={link} />, index)
        ),
      )}
    </>
  );
}

/** An article's Markdown, rendered with the platform kit's prose rules (`.p-article`). */
export function HelpBody({ body, idPrefix = "", onOpenArticle }: BodyProps) {
  const withOrg = useWithOrg();
  const blocks = useMemo(() => parseMarkdown(body), [body]);
  const link = (href: string, children: ReactNode, key: number) => {
    if (href.startsWith("help:")) {
      const [slug, section] = href.slice(5).split("#") as [HelpSlug, string | undefined];
      const path = withOrg(helpArticlePath(slug, section));
      return onOpenArticle ? (
        <a
          key={key}
          href={path}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            onOpenArticle({ slug, section });
          }}
        >
          {children}
        </a>
      ) : (
        <Link key={key} href={path}>
          {children}
        </Link>
      );
    }
    if (href.startsWith("/workspace")) {
      return (
        <Link key={key} href={withOrg(href)}>
          {children}
        </Link>
      );
    }
    return (
      <a key={key} href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  };
  return (
    <div className="p-article">
      {blocks.map((block, index) =>
        block.kind === "heading" ? (
          block.level === 2 ? (
            <h2 key={index} id={`${idPrefix}${block.id}`}>
              <InlineNodes nodes={block.children} link={link} />
            </h2>
          ) : (
            <h3 key={index} id={`${idPrefix}${block.id}`}>
              <InlineNodes nodes={block.children} link={link} />
            </h3>
          )
        ) : block.kind === "paragraph" ? (
          <p key={index}>
            <InlineNodes nodes={block.children} link={link} />
          </p>
        ) : block.kind === "list" ? (
          block.ordered ? (
            <ol key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineNodes nodes={item} link={link} />
                </li>
              ))}
            </ol>
          ) : (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineNodes nodes={item} link={link} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <pre key={index} className="p-pre">
            {block.text}
          </pre>
        ),
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ list --- */

/**
 * Search box and the matching articles. `renderItem` decides what a result
 * does: open in the panel, or link to the article page.
 */
export function HelpSearchList({
  articles,
  error,
  onRetry,
  renderItem,
  autoFocus = false,
}: {
  articles: HelpArticle[] | null;
  error: boolean;
  onRetry: () => void;
  renderItem: (article: HelpArticle) => ReactNode;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => (articles ? searchHelp(articles, query) : []), [articles, query]);
  const region = useRef<HTMLElement>(null);
  useEffect(() => {
    if (autoFocus) region.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus();
  }, [autoFocus]);
  return (
    <section ref={region} className="p-help-search" aria-label={t("helpArticles")}>
      <SearchInput value={query} onChange={setQuery} label={t("helpSearch")} placeholder={t("helpSearchPlaceholder")} />
      {error ? (
        <Status error action={<Action variant="secondary" size="sm" onClick={onRetry}>{t("retry")}</Action>}>
          {t("helpLoadError")}
        </Status>
      ) : !articles ? (
        <p className="p-loading" role="status">
          <span className="p-spinner" aria-hidden="true" />
          {t("helpLoading")}
        </p>
      ) : results.length ? (
        <ul className="p-help-list" aria-live="polite">
          {results.map((article) => (
            <li key={article.slug}>{renderItem(article)}</li>
          ))}
        </ul>
      ) : (
        <p className="p-cell-meta" role="status">
          {tv("helpNoResults", { query: query.trim() })}
        </p>
      )}
    </section>
  );
}

/** One result: title and summary. */
export function HelpListItemText({ article }: { article: HelpArticle }) {
  return (
    <>
      <span className="p-help-item-title">{article.title}</span>
      <span className="p-help-item-summary">{article.summary}</span>
    </>
  );
}
