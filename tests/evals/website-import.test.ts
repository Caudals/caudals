/**
 * "Import help centre" against a local fixture site (launch L-34): a real
 * Chromium reads an HTTPS site served from this process, with a sitemap index,
 * robots.txt and a second origin that must never be contacted. Host names are
 * mapped to the local server by the browser (no DNS, no network).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { discoverWebsitePages, MAX_LISTED_PAGES } from "../../lib/evals/connectors/website-discovery";
import { captureWebsiteContext, MAX_WEBSITE_PAGES } from "../../lib/evals/connectors/website-capture";

const HELP = "https://help.fixture.test";
const hits: Array<{ host: string; path: string }> = [];
const html = (title: string, body: string) => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main>${body}</main></body></html>`;
const urlset = (urls: string[]) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;

function respond(host: string, path: string): { status: number; type: string; body: string } {
  if (host === "help.fixture.test") {
    if (path === "/robots.txt") return { status: 200, type: "text/plain", body: [
      "User-agent: *", "Disallow: /help/private/", "Disallow: /kb/drafts",
      `Sitemap: ${HELP}/sitemap_index.xml`, "Sitemap: https://other.fixture.test/sitemap.xml",
    ].join("\n") };
    if (path === "/sitemap_index.xml") return { status: 200, type: "application/xml", body: `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>${HELP}/sitemap-blog.xml</loc></sitemap><sitemap><loc>${HELP}/sitemap-help.xml</loc></sitemap>
      <sitemap><loc>https://other.fixture.test/sitemap-leak.xml</loc></sitemap><sitemap><loc>${HELP}/sitemap-kb.xml</loc></sitemap></sitemapindex>` };
    if (path === "/sitemap-help.xml") return { status: 200, type: "application/xml", body: urlset([
      ...Array.from({ length: 40 }, (_, index) => `${HELP}/help/article-${index}`),
      `${HELP}/help/private/secret`, `${HELP}/help/manual.pdf`, "https://other.fixture.test/help/leak", `${HELP}/help/article-3`,
    ]) };
    if (path === "/sitemap-blog.xml") return { status: 200, type: "application/xml", body: urlset([`${HELP}/blog/launch`, `${HELP}/about`]) };
    if (path === "/sitemap-kb.xml") return { status: 200, type: "application/xml", body: urlset([
      ...Array.from({ length: 620 }, (_, index) => `${HELP}/kb/page-${index}`), `${HELP}/kb/drafts/new`,
    ]) };
    if (path === "/help") return { status: 200, type: "text/html", body: html("Help centre", `<h1>Help centre</h1><p>Find answers about refunds.</p><a href="/help/article-0">Refunds</a>`) };
    const article = /^\/(help|kb)\/(?:article|page)-(\d+)$/.exec(path);
    if (article) return { status: 200, type: "text/html", body: html(`Article ${article[2]}`, `<h1>${article[1]} ${article[2]}</h1><p>Refunds for order type ${article[2]} are sent within ${Number(article[2]) + 1} days to the original payment method.</p><a href="https://other.fixture.test/tracker">Partner</a>`) };
    if (path.startsWith("/help/private")) return { status: 200, type: "text/html", body: html("Private", "<p>Internal notes that robots.txt asks us not to read.</p>") };
    return { status: 404, type: "text/plain", body: "not found" };
  }
  if (host === "plain.fixture.test") {
    // No sitemap: the page list comes from the start page's links.
    if (path === "/support") return { status: 200, type: "text/html", body: html("Support", `<p>Support home.</p><a href="/support/billing">Billing</a> <a href="/support/returns">Returns</a> <a href="/careers">Jobs</a> <a href="https://other.fixture.test/x">Out</a>`) };
    if (path.startsWith("/support/")) return { status: 200, type: "text/html", body: html(path, `<p>Answers about ${path.slice(9)}.</p>`) };
    return { status: 404, type: "text/plain", body: "not found" };
  }
  if (host === "down.fixture.test") {
    if (path === "/robots.txt") return { status: 503, type: "text/plain", body: "unavailable" };
    return { status: 200, type: "text/html", body: html("Down", "<p>Help.</p>") };
  }
  return { status: 200, type: "text/html", body: html("Other", "<p>This origin must never be contacted.</p>") };
}

let server: Server;
let browser: Browser;
let directory: string;
/** The egress gateway's role in the fixture: only the fixture hosts resolve. */
const destinationCheck = async (raw: string) => {
  const url = new URL(raw);
  if (!url.hostname.endsWith(".fixture.test")) throw new Error("destination_denied");
};
const otherHits = () => hits.filter((hit) => hit.host === "other.fixture.test");

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "caudals-l34-site-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=fixture.test",
    "-addext", "subjectAltName=DNS:*.fixture.test", "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem")], { stdio: "ignore" });
  server = createServer({ key: readFileSync(join(directory, "key.pem")), cert: readFileSync(join(directory, "cert.pem")) }, (request, response) => {
    const host = (request.headers.host ?? "").replace(/:\d+$/, "");
    const path = new URL(request.url ?? "/", "https://x").pathname;
    hits.push({ host, path });
    const answer = respond(host, path);
    response.writeHead(answer.status, { "content-type": `${answer.type}; charset=utf-8` });
    response.end(answer.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  browser = await chromium.launch({ headless: true, args: [`--host-resolver-rules=MAP *.fixture.test 127.0.0.1:${port}`, "--ignore-certificate-errors"] });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("help-centre import against a local fixture site", () => {
  it("lists the help centre from its sitemap index: same origin only, robots.txt honoured, path prefix applied", async () => {
    hits.length = 0;
    const found = await discoverWebsitePages({ browser, startUrl: `${HELP}/help`, pathPrefix: "/help", destinationCheck });
    expect(found.origin).toBe(HELP);
    expect(found.discoveredFrom).toBe("sitemap");
    expect(found.pages).toEqual(Array.from({ length: 40 }, (_, index) => `${HELP}/help/article-${index}`));
    expect(found.foundTotal).toBe(40);
    expect(found.robotsExcluded).toBe(1);
    expect(found.outsidePrefix).toBeGreaterThanOrEqual(2 + 621);
    expect(found.pages.some((page) => page.includes("private") || page.endsWith(".pdf"))).toBe(false);
    // Never left the origin: neither the cross-origin sitemaps nor the listed foreign page were fetched.
    expect(otherHits()).toEqual([]);
    expect(hits.some((hit) => hit.path.startsWith("/help/private"))).toBe(false);
    // Nothing but robots.txt, the start page and sitemaps was read to make the list.
    expect(hits.filter((hit) => /^\/help\/article-/.test(hit.path))).toEqual([]);
  }, 60_000);

  it("bounds a large help centre: the list stops at 500 and robots-disallowed pages are left out", async () => {
    const found = await discoverWebsitePages({ browser, startUrl: `${HELP}/sitemap_index.xml`, pathPrefix: "/kb", destinationCheck });
    expect(found.pages).toHaveLength(MAX_LISTED_PAGES);
    expect(found.foundTotal).toBe(620);
    expect(found.robotsExcluded).toBe(1);
    expect(found.pages.at(-1)).toBe(`${HELP}/kb/page-${MAX_LISTED_PAGES - 1}`);
  }, 60_000);

  it("falls back to the start page's links without a sitemap, and refuses when robots.txt is unavailable", async () => {
    hits.length = 0;
    const found = await discoverWebsitePages({ browser, startUrl: "https://plain.fixture.test/support", pathPrefix: "/support", destinationCheck });
    expect(found.discoveredFrom).toBe("links");
    expect(found.pages).toEqual(["https://plain.fixture.test/support", "https://plain.fixture.test/support/billing", "https://plain.fixture.test/support/returns"]);
    expect(otherHits()).toEqual([]);
    await expect(discoverWebsitePages({ browser, startUrl: "https://down.fixture.test/help", destinationCheck })).rejects.toThrow("website_robots_unavailable");
  }, 60_000);

  it("reads exactly the selected pages: never another origin, never a disallowed page, never past the cap", async () => {
    hits.length = 0;
    const selected = [...Array.from({ length: 5 }, (_, index) => `${HELP}/help/article-${index}`), `${HELP}/help/private/secret`, "https://other.fixture.test/help/leak"];
    const capture = await captureWebsiteContext({ browser, startUrl: `${HELP}/help`, maxPages: selected.length, pages: selected, destinationCheck });
    expect(capture.urls).toEqual(selected.slice(0, 5));
    expect(capture.markdown).toContain("Refunds for order type 4 are sent within 5 days");
    expect(capture.markdown).not.toContain("Internal notes");
    expect(otherHits()).toEqual([]);
    expect(hits.some((hit) => hit.path.startsWith("/help/private"))).toBe(false);
    // No links were followed: only robots.txt and the five pages.
    expect(hits.filter((hit) => hit.host === "help.fixture.test" && hit.path !== "/favicon.ico").map((hit) => hit.path).sort()).toEqual(["/robots.txt", ...selected.slice(0, 5).map((url) => new URL(url).pathname)].sort());

    // A list longer than the largest plan cap is read up to the cap only.
    hits.length = 0;
    const many = Array.from({ length: MAX_WEBSITE_PAGES + 10 }, (_, index) => `${HELP}/kb/page-${index}`);
    const big = await captureWebsiteContext({ browser, startUrl: `${HELP}/kb/page-0`, maxPages: many.length, pages: many, destinationCheck });
    expect(big.urls).toHaveLength(MAX_WEBSITE_PAGES);
    expect(hits.filter((hit) => hit.path.startsWith("/kb/page-"))).toHaveLength(MAX_WEBSITE_PAGES);
  }, 180_000);
});
