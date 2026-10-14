/**
 * The expert-review label (launch L-26, spec P-32): "Reviewed by N experts on
 * <date>, scope …" reads the same on the web report, the PDF and the Word
 * document, in English and Spanish, and travels with a shared copy only when
 * the scope section is shared.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { ReportView } from "@/components/evals/report-view";
import { setLocale } from "@/lib/evals/messages/en";
import { buildReportSnapshot, reportSnapshotSchema, type ReportSnapshot } from "@/lib/evals/reports/contracts";
import { renderReportDocx } from "@/lib/evals/reports/docx";
import { renderReportHtml } from "@/lib/evals/reports/render";
import { redactSharedSnapshot } from "@/lib/evals/reports/share-redaction";
import { projectSharedReport } from "@/lib/evals/reports/shares";
import { buildExecutiveSummary, expertReviewLabel } from "@/lib/evals/reports/summary";
import { SUMMARY_COPY } from "@/lib/evals/reports/summary-copy";
import { renderEmail } from "@/lib/email/templates";
import { reportFixtures } from "@/scripts/evals/report-fixtures";

const ORDER = "00000000-0000-4000-8000-0000000000aa";
const unescape = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

function labelled(report: ReportSnapshot, count: number): ReportSnapshot {
  const { content_hash: _hash, ...rest } = report;
  void _hash;
  return buildReportSnapshot({ ...rest, expert_review: { order_id: ORDER, reviewer_count: count, reviewed_on: "2026-10-13T16:30:00.000Z", scope: "the 12 failed answers about fees" } });
}

afterAll(() => setLocale("en"));

describe("expert review label", () => {
  it("names the expert count, the date and the scope in both languages", () => {
    const label = { reviewer_count: 2, reviewed_on: "2026-10-13T16:30:00.000Z", scope: "the 12 failed answers about fees." };
    expect(expertReviewLabel(label, "en")).toBe("Reviewed by 2 experts on 13 October 2026, scope: the 12 failed answers about fees.");
    expect(expertReviewLabel(label, "es")).toBe("Revisado por 2 expertos el 13 de octubre de 2026; alcance: the 12 failed answers about fees.");
    expect(expertReviewLabel({ ...label, reviewer_count: 1 }, "en")).toMatch(/^Reviewed by 1 expert on /);
    expect(expertReviewLabel({ ...label, reviewer_count: 1 }, "es")).toMatch(/^Revisado por 1 experto el /);
    for (const copy of Object.values(SUMMARY_COPY)) expect(`${copy.expertReviewedOne} ${copy.expertReviewedMany} ${copy.labelExpertReviewed}`).not.toMatch(/certif|complian|cumplimiento|guarantee|garantiza/i);
  });

  it("refuses a malformed label", () => {
    const [fixture] = reportFixtures();
    const report = labelled(fixture.report, 2);
    expect(() => reportSnapshotSchema.parse({ ...report, expert_review: { ...report.expert_review, reviewer_count: 0 } })).toThrow();
    expect(() => reportSnapshotSchema.parse({ ...report, expert_review: { ...report.expert_review, order_id: "x" } })).toThrow();
  });

  for (const fixture of reportFixtures()) {
    for (const locale of ["en", "es"] as const) {
      it(`${fixture.name} (${locale}): the same label on the web, the PDF and Word`, async () => {
        setLocale(locale);
        const report = labelled(fixture.report, 3);
        const summary = buildExecutiveSummary(report, locale, { sample: fixture.sample })!;
        const status = summary.status.find((item) => item.key === "expert_reviewed")!;
        const text = expertReviewLabel(report.expert_review!, locale);
        expect(status.text).toBe(text);
        // The review status it qualifies is unchanged: a partial scope never turns into a fully reviewed report.
        expect(summary.status.map((item) => item.key)).toContain(report.scope.review_status);
        const web = unescape(renderToStaticMarkup(createElement(ReportView, { report, sample: fixture.sample })));
        expect(web).toContain(text);
        expect(unescape(renderReportHtml(report, locale, new Set(), { sample: fixture.sample }))).toContain(text);
        const xml = await (await JSZip.loadAsync(await renderReportDocx(report, locale, new Set(), { sample: fixture.sample }))).file("word/document.xml")!.async("string");
        expect(unescape([...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(""))).toContain(text);
      });
    }
  }

  it("travels with a shared copy only with the scope section", () => {
    const [fixture] = reportFixtures();
    const report = labelled(fixture.report, 2);
    expect(projectSharedReport(report, ["scope", "metrics"])).toHaveProperty("expert_review");
    expect(projectSharedReport(report, ["metrics"])).not.toHaveProperty("expert_review");
    expect(redactSharedSnapshot(report, ["scope", "metrics"]).report.expert_review).toEqual(report.expert_review);
    expect(redactSharedSnapshot(report, ["metrics"]).report.expert_review).toBeUndefined();
  });

  it("the customer's notification email (L-07 template) names the expert review", () => {
    const links = { url: "https://app.caudals.com/workspace/reports/r?orgId=o", settingsUrl: "https://app.caudals.com/workspace/settings?orgId=o#notifications" };
    const en = renderEmail("report_published", "en", { ...links, updated: true, reviewers: 2 });
    expect(en.subject).toBe("Experts reviewed your Caudals report");
    expect(en.text).toContain("2 experts reviewed your report.");
    expect(en.html).toContain(links.url);
    const es = renderEmail("report_published", "es", { ...links, updated: true, reviewers: 1 });
    expect(es.subject).toBe("Expertos han revisado tu informe de Caudals");
    expect(es.text).toContain("Un experto ha revisado tu informe.");
    // Without reviewers the update email is unchanged.
    expect(renderEmail("report_published", "en", { ...links, updated: true }).subject).toBe("Your Caudals evaluation results were updated");
  });
});
