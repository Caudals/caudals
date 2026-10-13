import { describe, expect, it } from "vitest";
import { insidePrefix, normalizePathPrefix, parseRobots, parseSitemap, robotsAllow } from "../../lib/evals/connectors/robots";

/** Launch L-34: robots.txt (RFC 9309) and sitemaps for "Import help centre". */
describe("robots.txt", () => {
  const robots = parseRobots(`# comment
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private/
Disallow: /*.json$
Allow: /private/public-faq
Disallow: /search

Sitemap: https://help.example.test/sitemap.xml
Sitemap: https://cdn.other.test/sitemap.xml`);

  it("uses the * group when no group names CaudalsBot, longest match wins and Allow wins a tie", () => {
    const allow = (path: string) => robotsAllow(robots, new URL(`https://help.example.test${path}`));
    expect(allow("/articles/refunds")).toBe(true);
    expect(allow("/private/billing")).toBe(false);
    expect(allow("/private/public-faq")).toBe(true);
    expect(allow("/data/export.json")).toBe(false);
    expect(allow("/data/export.json5")).toBe(true);
    expect(allow("/search")).toBe(false);
    expect(allow("/searching")).toBe(false);
    expect(robots.sitemaps).toEqual(["https://help.example.test/sitemap.xml", "https://cdn.other.test/sitemap.xml"]);
  });

  it("prefers a group that names CaudalsBot, and an empty Disallow allows everything", () => {
    const own = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: CaudalsBot/1.0\nUser-agent: other\nDisallow: /drafts\n");
    expect(robotsAllow(own, new URL("https://a.test/help"))).toBe(true);
    expect(robotsAllow(own, new URL("https://a.test/drafts/x"))).toBe(false);
    const open = parseRobots("User-agent: *\nDisallow:\n");
    expect(robotsAllow(open, new URL("https://a.test/anything"))).toBe(true);
    // A product token is matched whole: "bot" is not CaudalsBot.
    const other = parseRobots("User-agent: bot\nDisallow: /\n");
    expect(robotsAllow(other, new URL("https://a.test/x"))).toBe(true);
  });
});

describe("sitemaps", () => {
  it("reads <loc> entries of a urlset and an index, with entities and CDATA", () => {
    const urlset = parseSitemap(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://help.example.test/a?x=1&amp;y=2</loc></url>
      <url><loc> <![CDATA[https://help.example.test/b]]> </loc><lastmod>2026-10-01</lastmod></url></urlset>`);
    expect(urlset).toEqual({ kind: "urlset", locations: ["https://help.example.test/a?x=1&y=2", "https://help.example.test/b"] });
    const index = parseSitemap(`<sitemapindex><sitemap><loc>https://help.example.test/sitemap-1.xml</loc></sitemap></sitemapindex>`);
    expect(index).toEqual({ kind: "index", locations: ["https://help.example.test/sitemap-1.xml"] });
    expect(parseSitemap("<html>not a sitemap</html>").kind).toBe("unknown");
    expect(parseSitemap("<urlset>" + "<url><loc>https://a.test/x</loc></url>".repeat(20) + "</urlset>", 5).locations).toHaveLength(5);
  });

  it("normalises a path prefix and keeps pages inside it", () => {
    expect(normalizePathPrefix(" help ")).toBe("/help");
    expect(normalizePathPrefix("/es/ayuda/")).toBe("/es/ayuda/");
    expect(normalizePathPrefix("/")).toBeNull();
    expect(normalizePathPrefix("")).toBeNull();
    expect(() => normalizePathPrefix("/help?x=1")).toThrow("website_prefix_invalid");
    const inside = (path: string, prefix: string | null) => insidePrefix(new URL(`https://a.test${path}`), prefix);
    expect(inside("/help", "/help")).toBe(true);
    expect(inside("/help/refunds", "/help/")).toBe(true);
    expect(inside("/helpful", "/help")).toBe(false);
    expect(inside("/blog", null)).toBe(true);
  });
});
