import type { Browser, BrowserContext, Page } from "playwright";

const MAX_PAGE_CHARS = 40_000;
const MAX_TOTAL_CHARS = 1_000_000;
const MAX_LINKS_PER_PAGE = 200;
const MAX_REQUESTS_PER_PAGE = 100;

type CaptureOptions = {
  browser: Pick<Browser, "newContext">;
  startUrl: string;
  maxPages: number;
  /** Wall-clock budget for reading pages after the first (default 150 s). */
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

function inScopePage(raw: string, origin: string): URL | null {
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

export async function captureWebsiteContext(options: CaptureOptions): Promise<{ markdown: string; urls: string[] }> {
  const start = approvedWebsiteUrl(options.startUrl);
  const maxPages = Math.max(1, Math.min(50, Math.floor(options.maxPages)));
  // A capture is useful long before it is exhaustive: stop reading new pages
  // after this budget and keep what was read, instead of running for minutes.
  const deadline = Date.now() + (options.timeBudgetMs ?? 150_000);
  const context: BrowserContext = await options.browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  const pages = new Set<string>();
  const excerpts: string[] = [];
  let crawlOrigin = start.origin;
  let requestCount = 0;
  await context.route("**/*", async (route) => {
    const request = route.request();
    let url: URL;
    try { url = new URL(request.url()); } catch { await route.abort(); return; }
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        (request.isNavigationRequest() && pages.size > 0 && url.origin !== crawlOrigin) ||
        ["image", "media", "font"].includes(request.resourceType()) ||
        ++requestCount > MAX_REQUESTS_PER_PAGE) {
      await route.abort();
      return;
    }
    if (request.isNavigationRequest()) {
      try { await options.destinationCheck(url.href); }
      catch { await route.abort(); return; }
    }
    // The production HTTPS egress proxy also validates and pins every redirect
    // connection, including hops Playwright does not expose to this handler.
    await route.continue();
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  const queue: Array<{ url: string; depth: 0 | 1 }> = [{ url: start.href, depth: 0 }];
  let totalChars = 0;
  try {
    const page = await context.newPage();
    while (queue.length && pages.size < maxPages && (pages.size === 0 || Date.now() < deadline)) {
      const item = queue.shift()!;
      const safe = inScopePage(item.url, crawlOrigin);
      if (!safe || pages.has(safe.href)) continue;
      await options.destinationCheck(safe.href);
      requestCount = 0;
      let response;
      try {
        response = await page.goto(safe.href, { waitUntil: "domcontentloaded", timeout: pages.size === 0 ? 30_000 : 12_000 });
      } catch {
        if (pages.size === 0) throw new Error("website_page_unavailable");
        continue;
      }
      const finalUrl = publicWebsiteUrl(page.url());
      finalUrl.hash = "";
      if (pages.size > 0 && finalUrl.origin !== crawlOrigin) continue;
      if (pages.has(finalUrl.href)) continue;
      await options.destinationCheck(finalUrl.href);
      if (!response || response.status() >= 400) {
        if (pages.size === 0) throw new Error("website_page_unavailable");
        continue;
      }
      const captured = await readPage(page);
      const text = captured.text.replace(/\r/g, "").trim().slice(0, MAX_PAGE_CHARS);
      if (!text) {
        if (pages.size === 0) throw new Error("website_text_unavailable");
        continue;
      }
      // Resolve the submitted page first, then sample links from its final site.
      if (pages.size === 0) crawlOrigin = finalUrl.origin;
      const url = finalUrl.href;
      pages.add(url);
      const block = "# " + (captured.title.trim().slice(0, 300) || url) + "\n\nSource URL: " + url + "\n\n" + text;
      // Keep the pages that fit; a large site is sampled, not rejected.
      if (totalChars + block.length > MAX_TOTAL_CHARS) break;
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
    await context.close();
  }
}
