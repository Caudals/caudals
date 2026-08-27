/**
 * Content negotiation for "Markdown for Agents".
 *
 * Agents that send `Accept: text/markdown` get a clean markdown representation
 * of a page instead of the rendered HTML. Browsers, which never ask for
 * markdown, keep receiving HTML unchanged.
 *
 * @see https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
 */

export const MARKDOWN_MEDIA_TYPE = "text/markdown";
export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

/** Internal route that renders the markdown representation of a path. */
export const MARKDOWN_ROUTE_PREFIX = "/markdown-for-agents";

type AcceptEntry = {
  type: string;
  quality: number;
};

function parseAccept(header: string): AcceptEntry[] {
  return header
    .split(",")
    .map((part) => {
      const [rawType, ...params] = part.split(";");
      const type = rawType.trim().toLowerCase();
      if (!type) return null;

      // q must be read from its own parameter; other params (charset, level…)
      // are irrelevant to the choice between markdown and HTML.
      let quality = 1;
      for (const param of params) {
        const [key, value] = param.split("=");
        if (key?.trim().toLowerCase() !== "q") continue;
        const parsed = Number.parseFloat(value ?? "");
        if (Number.isFinite(parsed)) {
          quality = Math.min(Math.max(parsed, 0), 1);
        }
      }

      return { type, quality } satisfies AcceptEntry;
    })
    .filter((entry): entry is AcceptEntry => entry !== null);
}

/**
 * True when the client explicitly prefers markdown over HTML.
 *
 * Markdown must be requested by name: a browser's `*​/*` fallback is not a
 * request for markdown, otherwise every browser would stop getting HTML.
 */
export function prefersMarkdown(acceptHeader: string | null | undefined): boolean {
  if (!acceptHeader) return false;

  const entries = parseAccept(acceptHeader);
  const markdown = entries.find((entry) => entry.type === MARKDOWN_MEDIA_TYPE);
  if (!markdown || markdown.quality === 0) return false;

  // An explicit `text/html` of equal or higher quality means the client is
  // happy with HTML and only lists markdown as an alternative.
  const html = entries.find((entry) => entry.type === "text/html");
  if (html && html.quality >= markdown.quality) return false;

  return true;
}

/**
 * Rough token estimate for the `x-markdown-tokens` header.
 *
 * Deliberately dependency-free: agents use this to budget context, so an
 * approximation available on every response beats an exact count that would
 * require shipping a tokenizer to the server.
 */
export function estimateTokenCount(markdown: string): number {
  if (!markdown) return 0;
  return Math.max(1, Math.ceil(markdown.trim().length / 4));
}

/** Response headers shared by every markdown representation. */
export function markdownHeaders(body: string): Record<string, string> {
  return {
    "Content-Type": MARKDOWN_CONTENT_TYPE,
    // Caches must keep the markdown and HTML variants of a URL apart.
    Vary: "Accept",
    "x-markdown-tokens": String(estimateTokenCount(body)),
    "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  };
}
