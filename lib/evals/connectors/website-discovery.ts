/**
 * "Import help centre" page list (launch L-34, P-56). Runs in the browser
 * worker with the same guarded context and egress proxy as the website reader:
 * it reads the submitted page (or sitemap), robots.txt and the sitemaps the
 * origin publishes, and returns the pages that may be read. Nothing outside
 * the submitted origin is fetched or listed, robots.txt is honoured, and the
 * list is bounded. The pages themselves are read later, only those a person
 * selects (captureWebsiteContext with `pages`).
 */
import type { Browser, Page } from "playwright";
import { approvedWebsiteUrl, fetchTextFile, inScopePage, openGuardedContext, readRobots } from "./website-capture";
import { insidePrefix, parseSitemap, robotsAllow, type Robots } from "./robots";

/** The most pages a preview lists; a person picks up to the plan's cap from them. */
export const MAX_LISTED_PAGES = 500;
/** Sitemap files fetched per preview (the index and its children). */
const MAX_SITEMAP_FETCHES = 12;
/** URLs examined across all sitemaps. */
const MAX_SCANNED_URLS = 50_000;

export type DiscoveryOptions = {
  browser: Pick<Browser, "newContext">;
  /** A help-centre page or a sitemap URL. */
  startUrl: string;
  /** An explicit sitemap on the same origin (optional). */
  sitemapUrl?: string | null;
  /** Only pages under this path ("/help"). */
  pathPrefix?: string | null;
  destinationCheck: (url: string) => Promise<void>;
  /** Overall budget (default 90 s). */
  timeBudgetMs?: number;
};

export type DiscoveryResult = {
  origin: string;
  discoveredFrom: "sitemap" | "links";
  pages: string[];
  /** Pages that may be read (after origin, prefix and robots), before the listing limit. */
  foundTotal: number;
  robotsExcluded: number;
  outsidePrefix: number;
};

const looksLikeSitemap = (url: URL, contentType = "") => /\.xml$/i.test(url.pathname) || /xml/i.test(contentType);

async function readLinks(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).slice(0, 1000).map((anchor) => anchor.href));
}

export async function discoverWebsitePages(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const start = approvedWebsiteUrl(options.startUrl);
  const deadline = Date.now() + (options.timeBudgetMs ?? 90_000);
  const guarded = await openGuardedContext(options.browser, options.destinationCheck);
  try {
    const page = await guarded.context.newPage();
    // 1. The submitted URL decides the origin (after its redirects).
    let startLinks: string[] = [];
    let startIsSitemap = false;
    let startSitemapText: string | null = null;
    let origin: string;
    let startPage: string | null = null;
    if (looksLikeSitemap(start)) {
      const file = await fetchTextFile(page, start.href, options.destinationCheck).catch(() => { throw new Error("website_page_unavailable"); });
      if (!file) throw new Error("website_page_unavailable");
      origin = new URL(file.finalUrl).origin;
      startIsSitemap = true;
      startSitemapText = file.text;
    } else {
      await options.destinationCheck(start.href);
      let response;
      try { response = await page.goto(start.href, { waitUntil: "domcontentloaded", timeout: 30_000 }); }
      catch { throw new Error("website_page_unavailable"); }
      if (!response || response.status() >= 400) throw new Error("website_page_unavailable");
      const final = new URL(page.url());
      if (final.protocol !== "https:" || final.username || final.password || final.port) throw new Error("website_url_invalid");
      origin = final.origin;
      final.hash = "";
      startPage = inScopePage(final.href, origin)?.href ?? null;
      startLinks = await readLinks(page);
    }
    guarded.lock(origin);

    // 2. robots.txt of that origin, for our agent.
    guarded.reset();
    const robots: Robots = await readRobots(page, origin, options.destinationCheck);
    const prefix = options.pathPrefix ?? null;

    // 3. Sitemaps on the same origin: the one given, the ones robots.txt names, else /sitemap.xml.
    const sameOrigin = (raw: string) => { try { const url = new URL(raw, origin); return url.origin === origin && url.protocol === "https:" && !/\.gz$/i.test(url.pathname) ? url : null; } catch { return null; } };
    const queue: string[] = [];
    const queued = new Set<string>();
    const enqueue = (raw: string | null | undefined, front = false) => {
      const url = raw ? sameOrigin(raw) : null;
      if (!url) return;
      url.hash = "";
      if (queued.has(url.href)) return;
      queued.add(url.href);
      if (front) queue.unshift(url.href); else queue.push(url.href);
    };
    // A submitted sitemap is read once, below, even when robots.txt names it too.
    if (startIsSitemap) queued.add(start.href);
    enqueue(options.sitemapUrl);
    for (const entry of robots.sitemaps) enqueue(entry);
    if (!startIsSitemap && !queue.length) { enqueue(`${origin}/sitemap.xml`); enqueue(`${origin}/sitemap_index.xml`); }
    const urls: string[] = [];
    let fetches = 0;
    const take = (text: string) => {
      const sitemap = parseSitemap(text, MAX_SCANNED_URLS);
      if (sitemap.kind === "index") {
        // Children that mention the prefix first: a help centre's own sitemap.
        const children = sitemap.locations.map((location) => sameOrigin(location)).filter((url): url is URL => !!url);
        const hint = prefix ? prefix.replace(/^\/|\/$/g, "").toLowerCase() : "";
        children.sort((a, b) => Number(!!hint && b.href.toLowerCase().includes(hint)) - Number(!!hint && a.href.toLowerCase().includes(hint)));
        for (const child of children) enqueue(child.href);
      } else {
        for (const location of sitemap.locations) if (urls.length < MAX_SCANNED_URLS) urls.push(location);
      }
    };
    if (startSitemapText !== null) take(startSitemapText);
    while (queue.length && fetches < MAX_SITEMAP_FETCHES && urls.length < MAX_SCANNED_URLS && Date.now() < deadline) {
      const next = queue.shift()!;
      fetches++;
      guarded.reset();
      let file;
      try { file = await fetchTextFile(page, next, options.destinationCheck); } catch { continue; }
      if (!file || new URL(file.finalUrl).origin !== origin) continue;
      take(file.text);
    }

    // 4. No sitemap: the submitted page and its links.
    const discoveredFrom: DiscoveryResult["discoveredFrom"] = urls.length ? "sitemap" : "links";
    const candidates = urls.length ? urls : [...(startPage ? [startPage] : []), ...startLinks];

    // 5. Same origin, readable pages, inside the prefix, allowed by robots.txt.
    const pages: string[] = [];
    const seen = new Set<string>();
    let robotsExcluded = 0, outsidePrefix = 0, foundTotal = 0;
    for (const raw of candidates) {
      let parsed: URL;
      try { parsed = new URL(raw, origin); } catch { continue; }
      parsed.hash = "";
      const url = inScopePage(parsed.href, origin);
      if (!url || /\.(?:xml|gz|json|txt)$/i.test(url.pathname) || seen.has(url.href)) continue;
      seen.add(url.href);
      if (!insidePrefix(url, prefix)) { outsidePrefix++; continue; }
      if (!robotsAllow(robots, url)) { robotsExcluded++; continue; }
      foundTotal++;
      if (pages.length < MAX_LISTED_PAGES) pages.push(url.href);
    }
    if (!pages.length) throw new Error(robotsExcluded && !foundTotal ? "website_robots_disallowed" : "website_pages_not_found");
    return { origin, discoveredFrom, pages, foundTotal, robotsExcluded, outsidePrefix };
  } finally {
    await guarded.context.close();
  }
}
