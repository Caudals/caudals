import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { isPublicAddress, pinnedLookup, type Lookup } from "@/lib/evals/connectors/egress";

/** The registrable domain of a host (indexacapital.com, example.co.uk). */
export function registrable(host: string) {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".");
  const secondLevel = labels.length > 2 && labels.at(-1)!.length === 2 && /^(co|com|org|net|gov|gob|edu|ac|nhs)$/.test(labels.at(-2)!);
  return labels.slice(secondLevel ? -3 : -2).join(".");
}

/* ------------------------------------------------------------ transport --- */

export const DEMO_USER_AGENT = "Mozilla/5.0 (compatible; CaudalsBot/1.0; +https://caudals.com/demo)";

export class WebError extends Error {}

/**
 * Resolves a public HTTPS URL and returns the one address the socket must use.
 * Unlike the evaluation connector's check it allows a query string: pages and
 * redirects legitimately carry one, and the host is what SSRF protection needs.
 */
export async function pinPublic(raw: string, lookup: Lookup = dnsLookup) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new WebError("destination_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new WebError("destination_invalid");
  url.hash = "";
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname.includes(".") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new WebError("destination_invalid");
  let answers: Array<{ address: string; family: number }>;
  try { answers = await lookup(hostname, { all: true, verbatim: true }); } catch { throw new WebError("destination_unresolved"); }
  if (!answers.length || answers.some((answer) => !isPublicAddress(answer.address))) throw new WebError("destination_denied");
  return { url, address: answers[0].address, family: answers[0].family as 4 | 6 };
}

export type WebResponse = { status: number; url: URL; headers: Record<string, string>; body: Buffer<ArrayBufferLike> };

/** One HTTPS request to a pinned public address, with byte and time limits. Redirects are revalidated hop by hop. */
export async function request(raw: string, options: {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  maxBytes?: number;
  timeoutMs?: number;
  redirects?: number;
  signal?: AbortSignal;
  lookup?: Lookup;
} = {}): Promise<WebResponse> {
  const maxBytes = options.maxBytes ?? 2_000_000;
  let target = await pinPublic(raw, options.lookup);
  for (let hop = 0; ; hop++) {
    const response = await new Promise<WebResponse>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      const req = https.request(target.url, {
        method: options.method ?? "GET",
        agent: false,
        lookup: pinnedLookup(target),
        timeout: options.timeoutMs ?? 15_000,
        signal: options.signal,
        headers: {
          "user-agent": DEMO_USER_AGENT,
          "accept-encoding": "gzip, deflate, br",
          ...(options.body !== undefined ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(options.body)) } : {}),
          ...options.headers,
        },
      }, (res) => {
        res.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > maxBytes) res.destroy(new WebError("response_too_large"));
          else chunks.push(chunk);
        });
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) headers[key] = Array.isArray(value) ? value.join(", ") : value;
          let body: Buffer<ArrayBufferLike> = Buffer.concat(chunks);
          try {
            const encoding = headers["content-encoding"]?.toLowerCase();
            if (encoding === "gzip") body = gunzipSync(body, { maxOutputLength: maxBytes * 4 });
            else if (encoding === "br") body = brotliDecompressSync(body, { maxOutputLength: maxBytes * 4 });
            else if (encoding === "deflate") body = inflateSync(body, { maxOutputLength: maxBytes * 4 });
          } catch { reject(new WebError("response_unreadable")); return; }
          resolve({ status: res.statusCode ?? 0, url: target.url, headers, body });
        });
        res.on("error", (error) => reject(error instanceof WebError ? error : new WebError("response_interrupted")));
      });
      req.on("timeout", () => req.destroy(new WebError("timeout")));
      req.on("error", (error) => reject(error instanceof WebError ? error : new WebError(options.signal?.aborted ? "aborted" : "unreachable")));
      req.end(options.body);
    });
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location && (options.method ?? "GET") === "GET") {
      if (hop >= (options.redirects ?? 4)) throw new WebError("too_many_redirects");
      target = await pinPublic(new URL(location, target.url).href, options.lookup);
      continue;
    }
    return response;
  }
}

/* ----------------------------------------------------------- extraction --- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", euro: "€", iexcl: "¡", iquest: "¿", ordm: "º", ordf: "ª", middot: "·", copy: "©", reg: "®", deg: "°", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", ccedil: "ç", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", times: "×", sup2: "²", frac12: "½" };

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[entity] ?? match;
  });
}

const DROP = /<(script|style|noscript|svg|template|iframe|object|canvas|select|button|form|nav|footer|header|aside|dialog)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK = /<\/?(p|div|section|article|main|li|ul|ol|dl|dt|dd|tr|table|thead|tbody|h[1-6]|br|hr|blockquote|pre|figure|figcaption|details|summary)\b[^>]*>/gi;

function attr(tag: string, name: string) {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? "") : null;
}

export type ExtractedPage = { title: string; text: string; links: Array<{ url: string; label: string }>; lang: string | null };

/** Readable text, title and links from an HTML document. Deliberately small: no DOM, no scripts. */
export function extractPage(html: string, base: URL): ExtractedPage {
  const source = html.length > 3_000_000 ? html.slice(0, 3_000_000) : html;
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]{2,10})/i.exec(source)?.[1]?.toLowerCase() ?? null;
  const ogTitle = /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*>/i.exec(source)?.[0];
  const rawTitle = (ogTitle && attr(ogTitle, "content")) || /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1] || "";
  const title = decodeEntities(rawTitle.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim().slice(0, 160);

  const links: ExtractedPage["links"] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(` ${match[1]}`, "href");
    if (!href || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    let url: URL;
    try { url = new URL(href, base); } catch { continue; }
    url.hash = "";
    if (url.protocol !== "https:" || seen.has(url.href)) continue;
    seen.add(url.href);
    links.push({ url: url.href, label: decodeEntities(match[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 120) });
    if (links.length >= 400) break;
  }

  let body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(source)?.[1] ?? source;
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  // Prefer the page's main content when it carries most of the text.
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body)?.[1] ?? /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(body)?.[1];
  const scope = main && main.replace(/<[^>]+>/g, "").trim().length > 400 ? main : body;
  const text = scope
    .replace(DROP, " ")
    .replace(/<(h[1-6])\b[^>]*>/gi, "\n## ")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<(td|th)\b[^>]*>/gi, " | ")
    .replace(BLOCK, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines: string[] = [];
  const repeated = new Set<string>();
  for (const line of decodeEntities(text).split("\n")) {
    const clean = line.replace(/[ \t ]+/g, " ").replace(/^(\s*\|\s*)+|(\s*\|\s*)+$/g, "").trim();
    if (clean.length < 3 || clean === "##" || clean === "-") continue;
    const key = clean.toLowerCase();
    if (repeated.has(key) && clean.length < 120) continue;
    repeated.add(key);
    lines.push(clean);
  }
  return { title, text: lines.join("\n").slice(0, 60_000), links, lang };
}

/* -------------------------------------------------------------- reading --- */

const USEFUL = /help|ayuda|faq|preguntas|frecuentes|soporte|support|atencion|atención|pricing|precio|tarifa|fees|comision|comisión|condicion|condición|terms|termino|término|cobertura|coverage|seguro|insurance|garantia|garantía|warranty|devolucion|devolución|return|refund|reembolso|envio|envío|shipping|como-|how-|guia|guía|guide|docs|documentation|producto|product|plan|servicio|service|cuenta|hipoteca|mortgage|prestamo|préstamo|loan|tarjeta|card|contrat|requisit|requirement|plazo|deadline|limite|límite|limit|reclamacion|reclamación|claim|siniestro|poliza|póliza|policy|factura|bill|cancel|baja|alta|tramite|trámite|informacion|información|info/i;
const USELESS = /blog|news|noticia|prensa|press|career|empleo|trabaja|jobs|cookie|privacy|privacidad|aviso-legal|legal-notice|consejo|gobierno-corporativo|governance|accionista|shareholder|inversor|investor|sostenib|sustainab|responsabilidad-social|fundacion|foundation|patrocinio|sponsor|quienes-somos|sobre-nosotros|about-us|nuestra-historia|mision|mapa-web|sitemap|login|signin|sign-in|log-in|acceso|registro|register|cart|carrito|checkout|wishlist|search|buscar|tag\/|author|autor|category|categoria|page\/\d|\.(pdf|jpg|jpeg|png|gif|webp|zip|xml|json|mp4|mp3|doc|docx|xls|xlsx)$/i;

/** Orders same-site links by how likely they are to document how the product works. */
export function rankLinks(links: ExtractedPage["links"], start: URL, limit: number) {
  const site = registrable(start.hostname);
  const startLang = start.pathname.split("/")[1];
  const scored = new Map<string, number>();
  for (const link of links) {
    let url: URL;
    try { url = new URL(link.url); } catch { continue; }
    if (registrable(url.hostname) !== site || url.href === start.href || url.search.length > 60) continue;
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (path === "/" || USELESS.test(path) || USELESS.test(link.label)) continue;
    let score = 0;
    if (USEFUL.test(path)) score += 3;
    if (USEFUL.test(link.label)) score += 2;
    if (url.hostname === start.hostname) score += 1;
    // Stay in the visitor's language section (/es/..., /en/...).
    if (/^[a-z]{2}$/.test(startLang) && path.split("/")[1] === startLang) score += 1;
    if (/^[a-z]{2}$/.test(path.split("/")[1] ?? "") && /^[a-z]{2}$/.test(startLang) && path.split("/")[1] !== startLang) score -= 3;
    const depth = path.split("/").filter(Boolean).length;
    if (depth > 4) score -= 1;
    if (link.label.length < 3) score -= 1;
    scored.set(url.href, Math.max(scored.get(url.href) ?? -99, score));
  }
  return [...scored.entries()].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([href]) => href);
}

/** Disallow rules for any agent and for CaudalsBot in a robots.txt. */
export function robotsDisallows(robots: string): string[] {
  const rules: string[] = [];
  let applies = false;
  let inAgents = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const [, field, value] = match;
    if (field.toLowerCase() === "user-agent") {
      if (!inAgents) applies = false;
      inAgents = true;
      if (value === "*" || /caudalsbot/i.test(value)) applies = true;
    } else {
      inAgents = false;
      if (applies && field.toLowerCase() === "disallow" && value) rules.push(value);
    }
  }
  return rules;
}

export function allowedByRobots(url: URL, rules: string[]) {
  const path = url.pathname + url.search;
  return !rules.some((rule) => {
    const anchored = rule.endsWith("$");
    const pattern = (anchored ? rule.slice(0, -1) : rule).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
  });
}

export type DemoPage = { url: string; title: string; text: string };

/**
 * Reads the start page and up to `maxPages - 1` of its most useful same-site
 * links. Returns what could be read; the caller decides whether it is enough.
 */
export async function readSite(start: string, options: { maxPages?: number; locale?: string; signal?: AbortSignal; lookup?: Lookup; onPage?: (page: DemoPage) => void } = {}) {
  const maxPages = options.maxPages ?? 6;
  const headers = { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": options.locale === "en" ? "en,es;q=0.6" : "es,en;q=0.6" };
  const first = await request(start, { headers, signal: options.signal, lookup: options.lookup, timeoutMs: 15_000 });
  if (first.status >= 400) throw new WebError(first.status === 403 || first.status === 429 ? "site_blocked" : "site_unreachable");
  const contentType = first.headers["content-type"] ?? "";
  if (!/html|xml|text\/plain/i.test(contentType)) throw new WebError("site_not_html");
  const home = extractPage(first.body.toString("utf8"), first.url);
  const pages: DemoPage[] = [];
  if (home.text.length > 200) { pages.push({ url: first.url.href, title: home.title || first.url.hostname, text: home.text }); options.onPage?.(pages[0]); }

  let rules: string[] = [];
  try {
    const robots = await request(new URL("/robots.txt", first.url).href, { signal: options.signal, lookup: options.lookup, timeoutMs: 5_000, maxBytes: 200_000 });
    if (robots.status === 200) rules = robotsDisallows(robots.body.toString("utf8"));
  } catch { /* no robots.txt: nothing disallowed */ }

  const candidates = rankLinks(home.links, first.url, 14).filter((href) => allowedByRobots(new URL(href), rules));
  const queue = [...candidates];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length && pages.length < maxPages) {
      const href = queue.shift()!;
      try {
        const response = await request(href, { headers, signal: options.signal, lookup: options.lookup, timeoutMs: 12_000, maxBytes: 1_500_000 });
        if (response.status !== 200 || !/html/i.test(response.headers["content-type"] ?? "")) continue;
        const page = extractPage(response.body.toString("utf8"), response.url);
        if (page.text.length < 300 || pages.length >= maxPages || pages.some((item) => item.url === response.url.href || item.text === page.text)) continue;
        const item = { url: response.url.href, title: page.title || response.url.pathname, text: page.text };
        pages.push(item);
        options.onPage?.(item);
      } catch { /* one unreadable page does not stop the others */ }
    }
  });
  await Promise.all(workers);
  return { pages, lang: home.lang, finalUrl: first.url.href };
}
