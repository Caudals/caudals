/**
 * Launch L-20 routes: the public methodology page (metadata, sitemap,
 * llms.txt, agent markdown), the help article pages behind sign-in, and the
 * removed `/docs` staying removed.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ signedIn: true, locale: "es" as string | undefined }));
vi.mock("@/lib/blog/posts", () => ({ getBlogPosts: vi.fn(async () => []) }));
vi.mock("@/lib/newsletter/client", () => ({ getPublishedIssues: vi.fn(async () => []) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "caudals_locale" && session.locale ? { value: session.locale } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/evals/domain/identity", async () => {
  const { EvalError } = await import("@/lib/evals/domain/errors");
  return {
    requireIdentity: vi.fn(async () => {
      if (!session.signedIn) throw new EvalError("SESSION_REQUIRED", 401);
      return { user: { id: "u1", name: "Ana", email: "ana@example.test" }, platformRole: null, workspaces: [] };
    }),
  };
});

const { GET: sitemap } = await import("@/app/page-sitemap.xml/route");
const { GET: llms } = await import("@/app/llms.txt/route");
const methodology = await import("@/app/[locale]/methodology/page");
const helpArticle = await import("@/app/(evaluation)/(authenticated)/workspace/help/[slug]/page");
const { isStaticMarkdownPage, renderStaticPageMarkdown } = await import("@/lib/markdown/pages");

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });
afterEach(() => {
  session.signedIn = true;
  session.locale = "es";
});

describe("public methodology page", () => {
  it("is indexable with a canonical URL and hreflang in both languages", async () => {
    for (const [locale, path] of [["en", "/en/methodology"], ["es", "/es/metodologia"]] as const) {
      const metadata = await methodology.generateMetadata(params({ locale }));
      expect(String(metadata.alternates?.canonical)).toMatch(new RegExp(`${path}$`));
      expect(metadata.robots).toMatchObject({ index: true, follow: true });
      const languages = metadata.alternates?.languages as Record<string, string>;
      expect(languages.en).toMatch(/\/en\/methodology$/);
      expect(languages.es).toMatch(/\/es\/metodologia$/);
      expect(String(metadata.title)).toMatch(locale === "es" ? /Metodología/ : /Methodology/);
      expect(await methodology.default(params({ locale }))).toBeTruthy();
    }
    expect(methodology.generateStaticParams()).toEqual([{ locale: "en" }, { locale: "es" }]);
  });

  it("is listed in the sitemap, llms.txt and agent markdown", async () => {
    const xml = await (await sitemap()).text();
    expect(xml).toContain("/en/methodology</loc>");
    expect(xml).toContain("/es/metodologia</loc>");
    const text = await (await llms()).text();
    expect(text).toContain("/es/metodologia");
    expect(text).toContain("/en/methodology");
    // The offers lead with the free test and the free account (launch L-20 with L-30).
    expect(text.indexOf("**Prueba gratuita**")).toBeGreaterThan(0);
    expect(text.indexOf("**Prueba gratuita**")).toBeLessThan(text.indexOf("**Diagnóstico inicial**"));
    expect(isStaticMarkdownPage("/methodology")).toBe(true);
    const markdown = (await renderStaticPageMarkdown("/methodology", "es"))!;
    expect(markdown).toMatch(/^# Cómo probamos un asistente/);
    expect(markdown).toContain("Lo que nunca hacemos");
    expect(markdown).toContain("/es/metodologia");
  });

  it("keeps /docs removed", () => {
    for (const path of ["app/docs", "app/[locale]/docs", "app/(app)/docs"]) expect(existsSync(join(process.cwd(), path)), path).toBe(false);
  });
});

describe("help article pages", () => {
  it("render the article in the person's language with its related articles", async () => {
    const page = (await helpArticle.default(params({ slug: "connect-api" }))) as { props: { article: { title: string; slug: string }; related: Array<{ slug: string }> } };
    expect(page.props.article).toMatchObject({ slug: "connect-api", title: "Conectar una API" });
    expect(page.props.related.map((item) => item.slug)).toEqual(["connect-website-chat", "data-and-privacy", "prepare-and-run"]);
    session.locale = "en";
    const english = (await helpArticle.default(params({ slug: "connect-api" }))) as { props: { article: { title: string } } };
    expect(english.props.article.title).toBe("Connect an API");
  });

  it("answer 404 for an unknown article and send signed-out visitors to sign in", async () => {
    await expect(helpArticle.default(params({ slug: "docs" }))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    session.signedIn = false;
    await expect(helpArticle.default(params({ slug: "connect-api" }))).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
