/**
 * Cross-format consistency (launch L-17, spec P-20): the executive summary
 * and the headline the web report shows are word for word what the PDF and
 * the Word document print, for full reports and shared copies, in English
 * and Spanish. The web report is rendered with React's server renderer.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { ReportView } from "@/components/evals/report-view";
import { setLocale } from "@/lib/evals/messages/en";
import { renderReportDocx } from "@/lib/evals/reports/docx";
import { renderReportHtml } from "@/lib/evals/reports/render";
import { redactSharedSnapshot } from "@/lib/evals/reports/share-redaction";
import { projectSharedReport } from "@/lib/evals/reports/shares";
import { buildExecutiveSummary } from "@/lib/evals/reports/summary";
import { reportFixtures } from "@/scripts/evals/report-fixtures";

const DEFAULT_SHARE = ["system", "scope", "metrics", "takeaways", "findings", "improvements", "methodology"];
const unescape = (value: string) =>
  value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

function webSummary(markup: string) {
  return {
    sentences: [...markup.matchAll(/<span data-summary-text="[^"]*">([\s\S]*?)<\/span>/g)].map((match) => unescape(match[1])),
    sample: unescape(/data-sample="[^"]*">([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? ""),
    score: unescape(/class="p-score"[^>]*>([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? ""),
  };
}
function pdfSummary(html: string) {
  return {
    sentences: [...html.matchAll(/<p class="sentence" data-sentence="\w+">([\s\S]*?)(?: <span class="ref">[\s\S]*?<\/span>)?<\/p>/g)].map((match) => unescape(match[1])),
    sample: unescape(/<p class="sample-size" data-sample>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ""),
    score: unescape(/<span class="big">([\s\S]*?)<\/span>/.exec(html)?.[1] ?? ""),
  };
}
async function wordParagraphs(bytes: Buffer) {
  const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((match) => unescape([...match[0].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((text) => text[1]).join("")));
}

afterAll(() => setLocale("en"));

describe("executive summary across web, PDF and Word", () => {
  for (const fixture of reportFixtures()) {
    for (const locale of ["en", "es"] as const) {
      for (const shared of [false, true]) {
        it(`${fixture.name} (${locale}${shared ? ", shared without results" : ""})`, async () => {
          setLocale(locale);
          const options = { sample: fixture.sample };
          const web = shared ? projectSharedReport(fixture.report, DEFAULT_SHARE) : fixture.report;
          const document = shared ? redactSharedSnapshot(fixture.report, DEFAULT_SHARE) : { report: fixture.report, hidden: new Set<string>() };
          const expected = buildExecutiveSummary(web, locale, options)!;

          const fromWeb = webSummary(renderToStaticMarkup(createElement(ReportView, { report: web, sample: fixture.sample })));
          const fromPdf = pdfSummary(renderReportHtml(document.report, locale, document.hidden, options));
          const paragraphs = await wordParagraphs(await renderReportDocx(document.report, locale, document.hidden, options));

          const sentences = expected.sentences.map((item) => item.text);
          expect(sentences.length).toBe(shared ? 1 : 3);
          expect(fromWeb.sentences).toEqual(sentences);
          expect(fromPdf.sentences).toEqual(sentences);
          for (const sentence of sentences) expect(paragraphs).toContain(sentence);

          expect(fromWeb.sample).toBe(expected.sample);
          expect(fromPdf.sample).toBe(expected.sample);
          expect(paragraphs).toContain(expected.sample);

          // The headline is the same whole percentage everywhere, and it is the metric.
          expect(expected.percent).toBe(Math.round(fixture.report.metrics.strict_pass_rate! * 100));
          expect(fromWeb.score).toBe(expected.percentText);
          expect(fromPdf.score).toBe(expected.percentText);
          expect(paragraphs).toContain(expected.percentText);

          // The first fix the summary starts with leads the fix list in every format.
          if (!shared) {
            const first = expected.fixes[0];
            expect(renderToStaticMarkup(createElement(ReportView, { report: web, sample: fixture.sample }))).toContain(first.title.replace(/&/g, "&amp;"));
            expect(unescape(renderReportHtml(document.report, locale, document.hidden, options))).toContain(`<b>${first.title}</b>`);
            expect(paragraphs).toContain(first.title);
          }
        });
      }
    }
  }
});
