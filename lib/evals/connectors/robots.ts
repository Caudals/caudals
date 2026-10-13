/**
 * robots.txt and sitemap parsing for "Import help centre" (launch L-34).
 * Pure functions: the browser reader fetches the files through the egress
 * proxy and these decide what may be read.
 *
 * robots.txt follows RFC 9309: the group naming our product token
 * ("CaudalsBot") applies when there is one, otherwise the "*" groups; the
 * longest matching rule wins and Allow wins a tie; `*` and a final `$` are
 * the only special characters.
 */

export const ROBOTS_PRODUCT_TOKEN = "caudalsbot";

export type RobotsRule = { allow: boolean; pattern: string };
export type Robots = { rules: RobotsRule[]; sitemaps: string[] };

/** Rules for our agent and the Sitemap lines of one robots.txt. */
export function parseRobots(text: string, token = ROBOTS_PRODUCT_TOKEN): Robots {
  type Group = { agents: string[]; rules: RobotsRule[] };
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let collectingAgents = false;
  for (const raw of text.slice(0, 500_000).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "sitemap") {
      if (value && sitemaps.length < 50) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!collectingAgents || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
      continue;
    }
    collectingAgents = false;
    if (!current || (field !== "allow" && field !== "disallow")) continue;
    // An empty Disallow allows everything; it adds no rule.
    if (!value) continue;
    current.rules.push({ allow: field === "allow", pattern: value });
  }
  const own = groups.filter((group) => group.agents.some((agent) => agent.replace(/\/.*$/, "").trim() === token));
  const chosen = own.length ? own : groups.filter((group) => group.agents.includes("*"));
  return { rules: chosen.flatMap((group) => group.rules), sitemaps };
}

function patternMatches(pattern: string, path: string) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path);
}

/** Whether robots.txt lets us read this URL (path and query). */
export function robotsAllow(robots: Pick<Robots, "rules">, url: URL): boolean {
  const path = (url.pathname || "/") + url.search;
  let best: RobotsRule | null = null;
  for (const rule of robots.rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)) best = rule;
  }
  return !best || best.allow;
}

/** No rules: robots.txt is missing (4xx). */
export const ALLOW_ALL: Robots = Object.freeze({ rules: [], sitemaps: [] }) as Robots;

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export type Sitemap = { kind: "index" | "urlset" | "unknown"; locations: string[] };

/** The <loc> entries of a sitemap or sitemap index (sitemaps.org protocol), in document order. */
export function parseSitemap(xml: string, limit = 50_000): Sitemap {
  const text = xml.slice(0, 20_000_000);
  const kind = /<(?:[a-z0-9]+:)?sitemapindex[\s>]/i.test(text) ? "index" : /<(?:[a-z0-9]+:)?urlset[\s>]/i.test(text) ? "urlset" : "unknown";
  const locations: string[] = [];
  for (const match of text.matchAll(/<(?:[a-z0-9]+:)?loc\s*>([\s\S]*?)<\/(?:[a-z0-9]+:)?loc\s*>/gi)) {
    const raw = match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
    const value = decodeXml(raw).trim();
    if (value) locations.push(value);
    if (locations.length >= limit) break;
  }
  return { kind, locations };
}

/** A path prefix as typed ("help", "/help/", " /es/ayuda ") in canonical form, or null for none. */
export function normalizePathPrefix(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value || value === "/") return null;
  const path = value.startsWith("/") ? value : `/${value}`;
  if (path.length > 300 || /[?#\s]/.test(path)) throw new Error("website_prefix_invalid");
  return path;
}

/** Whether a URL is inside the prefix ("/help" covers /help, /help/ and /help/a, not /helpful). */
export function insidePrefix(url: URL, prefix: string | null): boolean {
  if (!prefix) return true;
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return url.pathname === base || url.pathname.startsWith(`${base}/`);
}
