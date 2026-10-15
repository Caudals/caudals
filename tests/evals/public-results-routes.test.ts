/**
 * Launch L-31 routes: the opt-in public results page and the anonymous
 * sector index answer 404 unless PUBLIC_RESULTS_ENABLED=true and a live,
 * consented record exists; they stay `noindex` until PUBLIC_RESULTS_INDEXED;
 * the owner's consent API is hidden with the flag off; the rendered pages
 * show the limits and no badge; and the removed routes stay removed. Gap G3:
 * with PUBLIC_RESULTS_INDEXED on, live pages (the database lists only
 * published pages whose consent stands, migration 114) join the sitemap and
 * llms.txt in both languages; otherwise they stay out, without a database read.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicResultPage, PublicSectorIndex } from "@/lib/publication/contracts";

const store = vi.hoisted(() => ({ page: null as PublicResultPage | null, index: null as PublicSectorIndex | null, reads: [] as string[], listFails: false }));
vi.mock("@/lib/publication/store", () => ({
  getPublicResultPage: vi.fn(async (slug: string) => { store.reads.push(`page:${slug}`); return store.page && store.page.slug === slug ? store.page : null; }),
  getPublicSectorIndex: vi.fn(async (quarter: string) => { store.reads.push(`index:${quarter}`); return store.index && store.index.quarter === quarter ? store.index : null; }),
  listPublicResultPages: vi.fn(async () => { store.reads.push("list"); if (store.listFails) throw new Error("database unavailable"); return store.page ? [store.page] : []; }),
  getPublicationStatus: vi.fn(async () => { throw new Error("must not be reached with the flag off"); }),
  recordConsent: vi.fn(async () => { throw new Error("must not be reached with the flag off"); }),
  revokeConsent: vi.fn(async () => { throw new Error("must not be reached with the flag off"); }),
}));
vi.mock("@/lib/evals/domain/identity", async () => ({
  requireIdentity: vi.fn(async () => ({ user: { id: "au_owner", name: "Ana", email: "ana@example.test" }, platformRole: null, workspaces: [] })),
  requireWorkspace: vi.fn(async () => undefined),
}));
// The header's language switcher reads the path; the page modules still use the real notFound().
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/en/results/gestoria-ejemplo-asistente",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, prefetch: () => undefined }),
}));
vi.mock("@/lib/blog/posts", () => ({ getBlogPosts: vi.fn(async () => []) }));
vi.mock("@/lib/newsletter/client", () => ({ getPublishedIssues: vi.fn(async () => []) }));

const results = await import("@/app/[locale]/results/[slug]/page");
const sectorIndex = await import("@/app/[locale]/sector-index/[quarter]/page");
const consentApi = await import("@/app/api/evals/v1/reports/[id]/publication/route");
const { PublicResultsPage } = await import("@/components/public/results-page");
const { SectorIndexPage } = await import("@/components/public/sector-index-page");
const { LocaleProvider } = await import("@/lib/i18n/context");
const { FrontDoorProvider } = await import("@/components/public/front-door");
const { GET: sitemap } = await import("@/app/page-sitemap.xml/route");
const { GET: llms } = await import("@/app/llms.txt/route");
const { isStaticMarkdownPage } = await import("@/lib/markdown/pages");

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

const page: PublicResultPage = {
  slug: "gestoria-ejemplo-asistente",
  publishedAt: "2026-10-14T09:00:00.000Z",
  projection: {
    schema: 1, public_name: "Gestoría Ejemplo", scope_summary: "Questions about invoices and VAT from the help centre, in Spanish.",
    tested_from: "2026-10-01T08:00:00.000Z", tested_to: "2026-10-01T09:30:00.000Z", languages: ["es"],
    questions: 48, scored: 46, correct: 33, partial: 5, incorrect: 8, not_scored: 2, pass_rate: 0.7174, interval_low: 0.5774, interval_high: 0.8268,
    review_status: "preliminary", scorer_version: "strict-v1", report_published_at: "2026-10-02T10:00:00.000Z", consented_on: "2026-10-10",
  },
};
const index: PublicSectorIndex = {
  quarter: "2026-Q3",
  rows: [{
    sector: "insurance", cohortSize: 12, methodologyVersion: "sector-index-v1", legalSignedOn: "2026-10-05", publishedAt: "2026-10-06T09:00:00.000Z",
    aggregates: { systems: 12, answers_scored: 410, median_pass: 61, p25_pass: 48, p75_pass: 72, correct_share: 59, partial_share: 12, incorrect_share: 29 },
  }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  store.page = null;
  store.index = null;
  store.reads = [];
  store.listFails = false;
});

describe("flag off (the production state)", () => {
  it("answers 404 for both pages in both languages without reading the database", async () => {
    store.page = page;
    store.index = index;
    for (const locale of ["en", "es"]) {
      await expect(results.default(params({ locale, slug: page.slug }))).rejects.toThrow(NOT_FOUND);
      await expect(sectorIndex.default(params({ locale, quarter: "2026-q3" }))).rejects.toThrow(NOT_FOUND);
      expect((await results.generateMetadata(params({ locale, slug: page.slug }))).robots).toMatchObject({ index: false });
    }
    expect(store.reads).toEqual([]);
  });

  it("hides the owner's consent API", async () => {
    const headers = { host: "localhost", origin: "http://localhost", "content-type": "application/json" };
    const url = "http://localhost/api/evals/v1/reports/00000000-0000-4000-8000-000000000301/publication";
    const get = await consentApi.GET(new Request(`${url}?orgId=00000000-0000-4000-8000-000000000001`, { headers }));
    expect(get.status).toBe(404);
    const post = await consentApi.POST(new Request(url, { method: "POST", headers, body: "{}" }));
    expect(post.status).toBe(404);
    const patch = await consentApi.PATCH(new Request(url, { method: "PATCH", headers, body: "{}" }));
    expect(patch.status).toBe(404);
  });
});

describe("flag on", () => {
  it("answers 404 without a live, consented record", async () => {
    vi.stubEnv("PUBLIC_RESULTS_ENABLED", "true");
    await expect(results.default(params({ locale: "en", slug: "nobody-consented" }))).rejects.toThrow(NOT_FOUND);
    await expect(results.default(params({ locale: "en", slug: "Bad Slug" }))).rejects.toThrow(NOT_FOUND);
    await expect(sectorIndex.default(params({ locale: "es", quarter: "2026-q4" }))).rejects.toThrow(NOT_FOUND);
    await expect(sectorIndex.default(params({ locale: "es", quarter: "2026-Q4" }))).rejects.toThrow(NOT_FOUND);
    await expect(sectorIndex.default(params({ locale: "es", quarter: "latest" }))).rejects.toThrow(NOT_FOUND);
  });

  it("renders a live page, noindex until the founder decides, with Spanish paths", async () => {
    vi.stubEnv("PUBLIC_RESULTS_ENABLED", "true");
    store.page = page;
    expect(await results.default(params({ locale: "es", slug: page.slug }))).toBeTruthy();
    const metadata = await results.generateMetadata(params({ locale: "es", slug: page.slug }));
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(String(metadata.alternates?.canonical)).toMatch(/\/es\/resultados\/gestoria-ejemplo-asistente$/);
    expect((metadata.alternates?.languages as Record<string, string>).en).toMatch(/\/en\/results\/gestoria-ejemplo-asistente$/);
    expect(String(metadata.title)).toContain("Gestoría Ejemplo");
    vi.stubEnv("PUBLIC_RESULTS_INDEXED", "true");
    expect((await results.generateMetadata(params({ locale: "en", slug: page.slug }))).robots).toMatchObject({ index: true });

    store.index = index;
    expect(await sectorIndex.default(params({ locale: "en", quarter: "2026-q3" }))).toBeTruthy();
    const indexMeta = await sectorIndex.generateMetadata(params({ locale: "es", quarter: "2026-q3" }));
    expect(String(indexMeta.alternates?.canonical)).toMatch(/\/es\/indice-sectorial\/2026-q3$/);
    expect(String(indexMeta.title)).toContain("3.º trimestre de 2026");
  });

  it("stays out of the sitemap, llms.txt and agent markdown until the founder indexes the pages", async () => {
    store.page = page;
    store.index = index;
    // Off (production today), on but not indexed, and indexed without the pages on: nothing listed, nothing read.
    for (const [enabled, indexed] of [["false", "false"], ["true", "false"], ["false", "true"]]) {
      vi.stubEnv("PUBLIC_RESULTS_ENABLED", enabled);
      vi.stubEnv("PUBLIC_RESULTS_INDEXED", indexed);
      const xml = await (await sitemap()).text();
      const text = await (await llms()).text();
      for (const output of [xml, text]) expect(output, `${enabled}/${indexed}`).not.toMatch(/\/results\/|\/resultados\/|sector-index|indice-sectorial|Resultados publicados/);
    }
    expect(store.reads).toEqual([]);
    expect(isStaticMarkdownPage("/results/gestoria-ejemplo-asistente")).toBe(false);
    expect(isStaticMarkdownPage("/sector-index/2026-q3")).toBe(false);
  });

  it("lists live pages in the sitemap and llms.txt once PUBLIC_RESULTS_INDEXED is on (gap G3)", async () => {
    vi.stubEnv("PUBLIC_RESULTS_ENABLED", "true");
    vi.stubEnv("PUBLIC_RESULTS_INDEXED", "true");
    store.page = page;
    store.index = index;
    const xml = await (await sitemap()).text();
    // One entry per language, each with the full hreflang set and the publication date.
    const { buildMarketingUrl } = await import("@/lib/seo");
    const en = buildMarketingUrl("/en/results/gestoria-ejemplo-asistente"), es = buildMarketingUrl("/es/resultados/gestoria-ejemplo-asistente");
    for (const loc of [en, es]) {
      const entry = new RegExp(`<url>\\s*<loc>${loc.replaceAll(".", "\\.")}</loc>\\s*<lastmod>2026-10-14</lastmod>[\\s\\S]*?</url>`).exec(xml)?.[0];
      expect(entry, loc).toBeTruthy();
      expect(entry).toContain(`hreflang="en" href="${en}"`);
      expect(entry).toContain(`hreflang="es" href="${es}"`);
    }
    const text = await (await llms()).text();
    expect(text).toContain("## Resultados publicados");
    expect(text).toContain(`- [Gestoría Ejemplo](${es}): Questions about invoices and VAT from the help centre, in Spanish. Publicado el 2026-10-14.`);
    expect(text).toMatch(/no una certificación ni una evaluación de conformidad/);
    expect(text).not.toMatch(/\bcertificad[oa]\b|\bcompliant\b|cumple con/i);
    // The anonymous index is never listed.
    for (const output of [xml, text]) expect(output).not.toMatch(/sector-index|indice-sectorial/);

    // Nothing live (withdrawn, taken down, never published): nothing listed.
    store.page = null;
    for (const output of [await (await sitemap()).text(), await (await llms()).text()]) expect(output).not.toMatch(/\/results\/|\/resultados\/|Resultados publicados/);
    // A database failure never breaks the sitemap or llms.txt.
    store.page = page;
    store.listFails = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await sitemap()).status).toBe(200);
    expect(await (await llms()).text()).not.toContain("Resultados publicados");
    errors.mockRestore();
  });
});

describe("rendered pages", () => {
  const Locale = LocaleProvider as FunctionComponent<{ locale: "en" | "es"; children?: ReactNode }>;
  const FrontDoor = FrontDoorProvider as FunctionComponent<{ value: { demoPublic: boolean; signInUrl: string }; children?: ReactNode }>;
  const render = (locale: "en" | "es", node: ReactNode) =>
    renderToStaticMarkup(createElement(Locale, { locale }, createElement(FrontDoor, { value: { demoPublic: true, signInUrl: "https://app.caudals.com/workspace/sign-in" } }, node)));
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

  it("show the date, scope, sample, methodology and limits, and no badge or seal", () => {
    for (const locale of ["en", "es"] as const) {
      const html = render(locale, createElement(PublicResultsPage, { locale, page }));
      const body = text(html);
      expect(body).toContain("Gestoría Ejemplo");
      expect(body).toContain(page.projection.scope_summary);
      expect(body).toMatch(locale === "es" ? /72 %/ : /72%/);
      expect(body).toMatch(locale === "es" ? /33 de 46 respuestas calificadas/ : /33 of 46 scored answers/);
      expect(body).toMatch(locale === "es" ? /Se hicieron 48 preguntas/ : /48 questions were asked/);
      expect(body).toMatch(locale === "es" ? /1 de octubre de 2026/ : /1 October 2026/);
      expect(body).toMatch(locale === "es" ? /no una certificación, una auditoría ni una evaluación de la conformidad/ : /not a certification, an audit or a conformity assessment/);
      expect(body).toMatch(locale === "es" ? /puede retirarla en cualquier momento/ : /can withdraw it at any time/);
      expect(html).toContain(locale === "es" ? 'href="/es/metodologia"' : 'href="/en/methodology"');
      expect(html).not.toMatch(/<img[^>]+(badge|seal|sello)/i);
      expect(body).not.toMatch(/\b(certified|compliant|certificado|homologado)\b/i);
    }
  });

  it("show only aggregates in the index: no name, host or best and worst system", () => {
    const html = render("en", createElement(SectorIndexPage, { locale: "en", index }));
    const body = text(html);
    expect(body).toContain("Insurance");
    expect(body).toContain("61%");
    expect(body).toContain("48% to 72%");
    expect(body).toMatch(/at least 10 systems count/);
    expect(body).not.toMatch(/minimum|maximum|mínimo|máximo/i);
    const spanish = text(render("es", createElement(SectorIndexPage, { locale: "es", index })));
    expect(spanish).toContain("Seguros");
    expect(spanish).toContain("de 48 % a 72 %");
  });
});

describe("removed routes stay removed", () => {
  it("has no page for the pre-pivot surfaces, and the new routes use neutral names", () => {
    for (const name of ["pricing", "docs", "security", "about", "buyer", "supplier", "v1", "careers", "catalogue"]) {
      for (const base of ["app", "app/[locale]", "app/(app)"]) expect(existsSync(join(process.cwd(), base, name)), `${base}/${name}`).toBe(false);
    }
    expect(existsSync(join(process.cwd(), "app/[locale]/results/[slug]/page.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "app/[locale]/sector-index/[quarter]/page.tsx"))).toBe(true);
  });
});
