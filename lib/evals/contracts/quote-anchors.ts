/** A frozen source revision as far as quote location needs it. */
export type QuotableSource = { revision_id: string; anchors: { id: string; excerpt: string; locator: string }[] };
export type LocatedQuote = { source_revision_id: string; anchors: string[]; url: string | null };

/** Case-, accent-width- and whitespace-insensitive text with a map back to original offsets. */
function normalized(text: string) {
  const chars: string[] = [];
  const map: number[] = [];
  let space = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index].normalize("NFKC").toLowerCase();
    if (/\s/u.test(char) || char === " ") {
      if (!space && chars.length) { chars.push(" "); map.push(index); }
      space = true;
      continue;
    }
    space = false;
    for (const part of char) { chars.push(part); map.push(index); }
  }
  if (chars.at(-1) === " ") { chars.pop(); map.pop(); }
  return { text: chars.join(""), map };
}

function startOf(locator: string, fallback: number) {
  const match = /^utf16:(\d+):(\d+)$/.exec(locator);
  return match ? Number(match[1]) : fallback;
}

const sourceUrl = /Source URL:\s*(\S+)/g;
const comparableUrl = (url: string) => url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

/**
 * Find a verbatim quote in the frozen text of the given sources and return the
 * anchors it spans. Captured web sources mark each page with "Source URL:"; when
 * a URL is given, only an occurrence inside that page counts.
 */
export function locateQuote(sources: QuotableSource[], quote: string, url?: string): LocatedQuote | null {
  const wanted = normalized(quote).text;
  if (wanted.length < 8) return null;
  for (const source of sources) {
    const anchors = [...source.anchors].sort((a, b) => startOf(a.locator, 0) - startOf(b.locator, 0));
    const spans: { id: string; start: number; end: number }[] = [];
    let text = "";
    for (const anchor of anchors) {
      spans.push({ id: anchor.id, start: text.length, end: text.length + anchor.excerpt.length });
      text += anchor.excerpt;
    }
    const pages = [...text.matchAll(sourceUrl)].map((match) => ({ at: match.index ?? 0, url: match[1] }));
    const flat = normalized(text);
    for (let from = flat.text.indexOf(wanted); from >= 0; from = flat.text.indexOf(wanted, from + 1)) {
      const start = flat.map[from];
      const end = flat.map[from + wanted.length - 1] + 1;
      const page = pages.filter((item) => item.at <= start).at(-1)?.url ?? null;
      if (url && (!page || comparableUrl(page) !== comparableUrl(url))) continue;
      return {
        source_revision_id: source.revision_id,
        anchors: spans.filter((span) => span.start < end && span.end > start).map((span) => span.id),
        url: page,
      };
    }
  }
  return null;
}
