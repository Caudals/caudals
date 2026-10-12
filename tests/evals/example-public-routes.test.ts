/**
 * Public surfaces of the sample report (launch L-33): the page, its PDF, the
 * sitemap and llms.txt follow EXAMPLE_EVALUATION_ENABLED and
 * SAMPLE_REPORT_INDEXED, read per request.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/blog/posts", () => ({ getBlogPosts: vi.fn(async () => []) }));
vi.mock("@/lib/newsletter/client", () => ({ getPublishedIssues: vi.fn(async () => []) }));
import { GET as pdf } from "@/app/sample-report/[file]/route";
import { GET as sitemap } from "@/app/page-sitemap.xml/route";
import { GET as llms } from "@/app/llms.txt/route";
import SampleReportRoute, { generateMetadata } from "@/app/[locale]/sample-report/page";
import { localizePathname, toInternalPathname } from "@/lib/i18n/routing";

function flags(enabled: boolean, indexed: boolean) {
  vi.stubEnv("EXAMPLE_EVALUATION_ENABLED", enabled ? "true" : "");
  vi.stubEnv("SAMPLE_REPORT_INDEXED", indexed ? "true" : "");
}
const params = (locale: string) => ({ params: Promise.resolve({ locale }) });
const file = (name: string) => ({ params: Promise.resolve({ file: name }) });
afterEach(() => vi.unstubAllEnvs());

describe("sample report routes", () => {
  it("translates the Spanish path", () => {
    expect(localizePathname("/sample-report", "en")).toBe("/en/sample-report");
    expect(localizePathname("/sample-report", "es")).toBe("/es/informe-de-ejemplo");
    expect(toInternalPathname("/informe-de-ejemplo", "es")).toBe("/sample-report");
  });

  it("serves the PDFs only while the example is enabled", async () => {
    flags(false, false);
    expect((await pdf(new Request("https://caudals.com/sample-report/caudals-sample-report-en.pdf"), file("caudals-sample-report-en.pdf"))).status).toBe(404);
    flags(true, false);
    for (const name of ["caudals-sample-report-en.pdf", "caudals-informe-de-ejemplo-es.pdf"]) {
      const response = await pdf(new Request(`https://caudals.com/sample-report/${name}`), file(name));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    }
    expect((await pdf(new Request("https://caudals.com/sample-report/../manifest.json"), file("manifest.json"))).status).toBe(404);
  });

  it("answers 404 while off, and stays noindex until the founder's go-ahead", async () => {
    flags(false, false);
    await expect(SampleReportRoute(params("en"))).rejects.toThrow();
    flags(true, false);
    expect(await SampleReportRoute(params("es"))).toBeTruthy();
    expect((await generateMetadata(params("es"))).robots).toMatchObject({ index: false });
    flags(true, true);
    const metadata = await generateMetadata(params("es"));
    expect(metadata.robots).toMatchObject({ index: true });
    expect(String(metadata.alternates?.canonical)).toMatch(/\/es\/informe-de-ejemplo$/);
  });

  it("joins the sitemap and llms.txt only once indexed", async () => {
    flags(true, false);
    expect(await (await sitemap()).text()).not.toContain("sample-report");
    expect(await (await llms()).text()).not.toContain("informe-de-ejemplo");
    flags(true, true);
    const xml = await (await sitemap()).text();
    expect(xml).toContain("/en/sample-report");
    expect(xml).toContain("/es/informe-de-ejemplo");
    expect(await (await llms()).text()).toContain("/es/informe-de-ejemplo");
  });
});
