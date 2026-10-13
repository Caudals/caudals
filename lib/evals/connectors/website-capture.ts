import type { Browser, BrowserContext, Page } from "playwright";
import { ALLOW_ALL, parseRobots, robotsAllow, type Robots } from "./robots";

const MAX_PAGE_CHARS = 40_000;
const MAX_TOTAL_CHARS = 1_000_000;
const MAX_LINKS_PER_PAGE = 200;
const MAX_REQUESTS_PER_PAGE = 100;
/** The most pages one website source reads: the PAYG plan cap (launch L-34). The API applies each plan's cap. */
export const MAX_WEBSITE_PAGES = 200;
/** robots.txt and sitemaps larger than this are not read. */
const MAX_TEXT_FILE_CHARS = 10_000_000;

type CaptureOptions = {
  browser: Pick<Browser, "newContext">;
  startUrl: string;
  maxPages: number;
  /**
   * Read exactly these pages, in order, and follow no links (an imported help
   * centre, launch L-34). They must share the first readable page's origin,
   * and robots.txt is checked again before reading.
   */
  pages?: string[];
  /** Wall-clock budget for reading pages after the first (default 150 s; scaled with the list for `pages`). */
  timeBudgetMs?: number;
  destinationCheck: (url: string) => Promise<void>;
  onPage?: (url: string, pageCount: number) => Promise<void>;
};

type PageText = { title: string; text: string; links: string[] };

function publicWebsiteUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("website_url_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("website_url_invalid");
  }
  return url;
}

export function approvedWebsiteUrl(raw: string): URL {
  const url = publicWebsiteUrl(raw);
  if (url.search || url.hash) throw new Error("website_url_invalid");
  return url;
}

export function inScopePage(raw: string, origin: string): URL | null {
  try {
    const url = new URL(raw, origin);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password || url.port || url.search || url.hash) return null;
    if (/\.(?:pdf|docx?|xlsx?|csv|zip|png|jpe?g|gif|svg|mp4|mp3|webm)$/i.test(url.pathname)) return null;
    if (/(?:^|\/)(?:logout|log-out|signout|sign-out|delete|remove)(?:\/|$)/i.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}

async function readPage(page: Page): Promise<PageText> {
  return page.evaluate((linkLimit) => ({
    title: document.title,
    text: document.body?.innerText ?? "",
    links: Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .slice(0, linkLimit)
      .map((anchor) => anchor.href),
  }), MAX_LINKS_PER_PAGE);
}

/**
 * A browser context that can only navigate public HTTPS pages, checked by the
 * egress gateway, and stays on one origin once it is set. Images, media,
 * fonts, downloads, service workers and WebSockets are refused.
 */
export async function openGuardedContext(browser: Pick<Browser, "newContext">, destinationCheck: (url: string) => Promise<void>) {
  const context: BrowserContext = await browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  const state = { origin: null as string | null, requests: 0 };
  await context.route("**/*", async (route) => {
    const request = route.request();
    let url: URL;
    try { url = new URL(request.url()); } catch { await route.abort(); return; }
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        (request.isNavigationRequest() && state.origin !== null && url.origin !== state.origin) ||
        ["image", "media", "font"].includes(request.resourceType()) ||
        ++state.requests > MAX_REQUESTS_PER_PAGE) {
      await route.abort();
      return;
    }
    if (request.isNavigationRequest()) {
      try { await destinationCheck(url.href); }
      catch { await route.abort(); return; }
    }
    // The production HTTPS egress proxy also validates and pins every redirect
    // connection, including hops Playwright does not expose to this handler.
    await route.continue();
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  return {
    context,
    /** Lock navigation to this origin (after the first page resolved its redirects). */
    lock(origin: string) { state.origin = origin; },
    /** Start a new page budget of sub-requests. */
    reset() { state.requests = 0; },
  };
}

/**
 * Fetch a text file (robots.txt, a sitemap) by navigating to it, so the
 * request takes the same egress path and checks as a page. Returns null for
 * a missing file (4xx); throws on a server error or an unreachable host.
 */
export async function fetchTextFile(page: Pick<Page, "goto" | "url">, url: string, destinationCheck: (url: string) => Promise<void>): Promise<{ status: number; text: string; contentType: string; finalUrl: string } | null> {
  await destinationCheck(url);
  const response = await page.goto(url, { waitUntil: "commit", timeout: 20_000 });
  if (!response) throw new Error("website_file_unavailable");
  const status = response.status();
  if (status >= 400 && status < 500) return null;
  if (status >= 500) throw new Error("website_file_unavailable");
  const declared = Number(response.headers()["content-length"] ?? 0);
  if (declared > MAX_TEXT_FILE_CHARS) throw new Error("website_file_too_large");
  const text = await response.text();
  if (text.length > MAX_TEXT_FILE_CHARS) throw new Error("website_file_too_large");
  return { status, text, contentType: response.headers()["content-type"] ?? "", finalUrl: page.url() };
}

/**
 * robots.txt of an origin for our agent: no rules when it is missing (4xx);
 * an unreachable or failing robots.txt means nothing may be read (RFC 9309).
 */
export async function readRobots(page: Pick<Page, "goto" | "url">, origin: string, destinationCheck: (url: string) => Promise<void>): Promise<Robots> {
  let file;
  try { file = await fetchTextFile(page, `${origin}/robots.txt`, destinationCheck); }
  catch { throw new Error("website_robots_unavailable"); }
  if (!file) return ALLOW_ALL;
  // A robots.txt redirected to another origin is treated as missing.
  if (new URL(file.finalUrl).origin !== origin) return ALLOW_ALL;
  return parseRobots(file.text);
}

export async function captureWebsiteContext(options: CaptureOptions): Promise<{ markdown: string; urls: string[] }> {
  const start = approvedWebsiteUrl(options.startUrl);
  const fixed = options.pages?.length ? options.pages.slice(0, MAX_WEBSITE_PAGES) : null;
  const maxPages = fixed ? fixed.length : Math.max(1, Math.min(MAX_WEBSITE_PAGES, Math.floor(options.maxPages)));
  // A capture is useful long before it is exhaustive: stop reading new pages
  // after this budget and keep what was read, instead of running for minutes.
  // An imported page list gets about four seconds a page, at most ten minutes.
  const budget = options.timeBudgetMs ?? (fixed ? Math.min(600_000, 60_000 + 4_000 * fixed.length) : 150_000);
  const deadline = Date.now() + budget;
  const guarded = await openGuardedContext(options.browser, options.destinationCheck);
  const pages = new Set<string>();
  const excerpts: string[] = [];
  let crawlOrigin = start.origin;
  const queue: Array<{ url: string; depth: 0 | 1 }> = fixed
    ? fixed.map((url) => ({ url, depth: 1 as const }))
    : [{ url: start.href, depth: 0 }];
  let totalChars = 0;
  let robots: Robots | null = null;
  try {
    const page = await guarded.context.newPage();
    if (fixed) {
      // The list came from one origin; robots.txt is honoured again at read time.
      guarded.lock(crawlOrigin);
      robots = await readRobots(page, crawlOrigin, options.destinationCheck);
    }
    while (queue.length && pages.size < maxPages && (pages.size === 0 || Date.now() < deadline)) {
      const item = queue.shift()!;
      const safe = inScopePage(item.url, crawlOrigin);
      if (!safe || pages.has(safe.href)) continue;
      if (robots && !robotsAllow(robots, safe)) continue;
      await options.destinationCheck(safe.href);
      guarded.reset();
      let response;
      try {
        response = await page.goto(safe.href, { waitUntil: "domcontentloaded", timeout: pages.size === 0 ? 30_000 : 12_000 });
      } catch {
        if (pages.size === 0 && !fixed) throw new Error("website_page_unavailable");
        continue;
      }
      const finalUrl = publicWebsiteUrl(page.url());
      finalUrl.hash = "";
      if ((pages.size > 0 || fixed) && finalUrl.origin !== crawlOrigin) continue;
      if (pages.has(finalUrl.href)) continue;
      await options.destinationCheck(finalUrl.href);
      if (!response || response.status() >= 400) {
        if (pages.size === 0 && !fixed) throw new Error("website_page_unavailable");
        continue;
      }
      const captured = await readPage(page);
      const text = captured.text.replace(/\r/g, "").trim().slice(0, MAX_PAGE_CHARS);
      if (!text) {
        if (pages.size === 0 && !fixed) throw new Error("website_text_unavailable");
        continue;
      }
      // Resolve the submitted page first, then sample links from its final site.
      if (pages.size === 0 && !fixed) { crawlOrigin = finalUrl.origin; guarded.lock(crawlOrigin); }
      const url = finalUrl.href;
      pages.add(url);
      const block = "# " + (captured.title.trim().slice(0, 300) || url) + "\n\nSource URL: " + url + "\n\n" + text;
      // Keep the pages that fit; a large site is sampled, not rejected.
      if (totalChars + block.length > MAX_TOTAL_CHARS) { pages.delete(url); break; }
      totalChars += block.length;
      excerpts.push(block);
      await options.onPage?.(url, pages.size);
      if (item.depth === 0) {
        for (const link of captured.links) {
          const next = inScopePage(link, crawlOrigin);
          if (next && !pages.has(next.href) && !queue.some((queued) => queued.url === next.href)) {
            queue.push({ url: next.href, depth: 1 });
            if (queue.length >= maxPages * 4) break;
          }
        }
      }
    }
    if (!excerpts.length) throw new Error("website_text_unavailable");
    return { markdown: excerpts.join("\n\n---\n\n"), urls: [...pages] };
  } finally {
    await guarded.context.close();
  }
}
