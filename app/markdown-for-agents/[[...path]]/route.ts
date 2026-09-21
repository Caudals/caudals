import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { splitLocale } from "@/lib/i18n/routing";
import { markdownHeaders } from "@/lib/markdown/negotiation";
import { isStaticMarkdownPage, renderStaticPageMarkdown } from "@/lib/markdown/pages";
import {
  renderBlogIndexMarkdown,
  renderBlogPostMarkdown,
  renderNewsletterIndexMarkdown,
  renderNewsletterIssueMarkdown,
} from "@/lib/markdown/render";

// Blog posts and newsletter issues are read from disk and from the CMS, so this
// handler needs the Node runtime rather than the edge one the proxy runs on.
export const runtime = "nodejs";
export const revalidate = 3600;

/** Resolves a marketing pathname to its markdown body, or null if unsupported. */
async function renderForPath(
  pathname: string,
  locale: Locale,
): Promise<string | null> {
  if (isStaticMarkdownPage(pathname)) {
    return renderStaticPageMarkdown(pathname, locale);
  }

  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "blog") {
    if (segments.length === 1) return renderBlogIndexMarkdown(locale);
    if (segments.length === 2) {
      return renderBlogPostMarkdown(segments[1], locale);
    }
    return null;
  }

  if (segments[0] === "newsletter") {
    if (segments.length === 1) return renderNewsletterIndexMarkdown();
    if (segments.length === 2) return renderNewsletterIssueMarkdown(segments[1]);
    return null;
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  const requestedPath = `/${(path ?? []).join("/")}`.replace(/\/+$/, "") || "/";
  // The locale comes from the URL, exactly as it does for the HTML pages, so an
  // agent asking for `/es/blog` as markdown gets the Spanish text.
  const { locale: pathLocale, pathname } = splitLocale(requestedPath);
  const locale = pathLocale ?? defaultLocale;

  let body: string | null = null;
  try {
    body = await renderForPath(pathname, locale);
  } catch (error) {
    console.error(`[Markdown] Failed to render "${pathname}":`, error);
    // Fall through to the HTML-is-authoritative response below rather than
    // serving a 500 to an agent that would have been fine with the page.
  }

  if (!body) {
    return new Response(
      `# Not available as markdown\n\nThis path has no markdown representation. Fetch it as HTML instead.\n`,
      {
        status: 404,
        headers: markdownHeaders(""),
      },
    );
  }

  // Next appends its own Vary dimensions as a separate header line. Multiple
  // Vary lines are equivalent to one comma-joined value (RFC 9110 §5.3), so
  // caches still key the markdown and HTML variants apart.
  return new Response(body, { headers: markdownHeaders(body) });
}
