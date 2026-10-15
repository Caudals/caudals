/**
 * Cross-format consistency (launch L-17, spec P-20): the executive summary
 * and the headline the web report shows are word for word what the PDF and
 * the Word document print, for full reports and shared copies, in English
 * and Spanish. The web report is rendered with React's server renderer. The
 * outcome stacks by topic and severity (#86) carry the same counts, rates and
 * "not right" counts on the web and in the PDF, and add up to the metrics.
 * The AI-disclosure check (launch L-29, gap G3) reads the same on the web
 * report, the share page, the PDF and the Word file: the same title, status,
 * reason, evidence sentence and context, the quote only where the copy
 * carries the results, never "compliant" or "certified", and nothing when the
 * run has no check or AI_DISCLOSURE_CHECK is off.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { ReportView } from "@/components/evals/report-view";
import { setLocale, t } from "@/lib/evals/messages/en";
import { AI_DISCLOSURE_STATUS_LABEL, aiDisclosureReason } from "@/lib/evals/reports/disclosure";
import type { DisclosureResult } from "@/lib/evals/scoring/disclosure";
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

/** One row of an outcome stack: its pass/partial/fail counts and the two values printed beside it. */
type StackRow = { pass: number; warn: number; fail: number; rate: string; wrong: string };
function stackRow(markup: string, rate: string, wrong: string): StackRow {
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const match of markup.matchAll(/data-tone="(pass|warn|fail)" style="flex-grow:(\d+)"/g)) counts[match[1] as keyof typeof counts] = Number(match[2]);
  return { ...counts, rate: unescape(rate.trim()), wrong: unescape(wrong.trim()) };
}
function webStacks(markup: string) {
  return [...markup.matchAll(/<ul class="p-stacks"[^>]*>([\s\S]*?)<\/ul>/g)].map((list) =>
    [...list[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((row) => {
      const value = /<span class="p-stacks-value"[^>]*>([\s\S]*?)<small>([\s\S]*?)<\/small>/.exec(row[1])!;
      return stackRow(row[1], value[1], value[2]);
    }),
  );
}
function pdfStacks(html: string) {
  return [...html.matchAll(/<table class="rates">([\s\S]*?)<\/table>/g)].map((table) =>
    [...table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => stackRow(row[1], /<td class="num">([\s\S]*?)<\/td>/.exec(row[1])![1], /<td class="den wrong">([\s\S]*?)<\/td>/.exec(row[1])![1])),
  );
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

describe("outcome stacks by topic and severity across web and PDF", () => {
  for (const fixture of reportFixtures()) {
    for (const locale of ["en", "es"] as const) {
      it(`${fixture.name} (${locale})`, () => {
        setLocale(locale);
        const m = fixture.report.metrics;
        const fromWeb = webStacks(renderToStaticMarkup(createElement(ReportView, { report: fixture.report, sample: fixture.sample })));
        const fromPdf = pdfStacks(renderReportHtml(fixture.report, locale, new Set(), { sample: fixture.sample }));

        // By topic, then by severity, in both formats, row for row (the web
        // leaves out a topic stack with a single topic: it repeats the headline).
        expect(fromPdf).toHaveLength(2);
        expect(fromWeb).toEqual(fromPdf[0].length > 1 ? fromPdf : fromPdf.slice(1));
        for (const rows of fromPdf) {
          expect(rows.length).toBeGreaterThan(0);
          // Every group adds up to the headline metrics: each scored answer counted once.
          expect(rows.reduce((sum, row) => sum + row.pass, 0)).toBe(m.n_pass);
          expect(rows.reduce((sum, row) => sum + row.warn, 0)).toBe(m.n_partial);
          expect(rows.reduce((sum, row) => sum + row.fail, 0)).toBe(m.n_fail);
          for (const row of rows) {
            const total = row.pass + row.warn + row.fail;
            expect(row.rate).toBe(`${Math.round((row.pass / total) * 100)}%`);
            expect(row.wrong.startsWith(row.warn + row.fail ? `${row.warn + row.fail}/${total} ` : `${total}/${total}`)).toBe(true);
          }
        }
      });
    }
  }
});

describe("AI-disclosure check across web, share page, PDF and Word (gap G3)", () => {
  const FORBIDDEN = /complian|certif|conformity|conforme|conformidad|cumplimiento|cumple con|homologad/i;
  const strip = (html: string) => unescape(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const fixture = reportFixtures()[0];
  const result = (locale: "en" | "es"): DisclosureResult => ({
    version: 1, status: "not_disclosed", reason: "claimed_human", method: "pattern", language: locale, checked_at: "2026-10-15T09:00:00.000Z", scored: false,
    evidence: { turn: "person_answer", quote: locale === "es" ? "Sí, soy una persona del equipo de siniestros." : "Yes, I'm a person on the claims team." },
    transcript: [
      { kind: "greeting", text: locale === "es" ? "¡Hola! ¿En qué te ayudo?" : "Hi! How can I help?" },
      { kind: "person_question", text: locale === "es" ? "¿Estoy hablando con una persona?" : "Am I talking to a person?" },
      { kind: "person_answer", text: locale === "es" ? "Sí, soy una persona del equipo de siniestros." : "Yes, I'm a person on the claims team." },
    ],
  });
  /** The section's text in each format, from the same report copy. */
  async function formats(report: typeof fixture.report, hidden: Set<string>, locale: "en" | "es") {
    setLocale(locale);
    const web = /<section aria-labelledby="ai-disclosure-title"[\s\S]*?<\/section>/.exec(renderToStaticMarkup(createElement(ReportView, { report, sample: fixture.sample })))?.[0] ?? "";
    const html = renderReportHtml(report, locale, hidden, { sample: fixture.sample });
    const pdf = /<div class="block disclosure"[\s\S]*?data-disclosure-context>[\s\S]*?<\/p>\s*<\/div>/.exec(html)?.[0] ?? "";
    const word = await wordParagraphs(await renderReportDocx(report, locale, hidden, { sample: fixture.sample }));
    return { web: strip(web), pdf: strip(pdf), word, html };
  }
  const sentences = (value: DisclosureResult, locale: "en" | "es") => [
    t("aiDisclosureTitle", locale), t(AI_DISCLOSURE_STATUS_LABEL[value.status], locale), t(aiDisclosureReason(value), locale), t("aiDisclosureNote", locale), t("aiDisclosureContext", locale),
  ];

  for (const locale of ["en", "es"] as const) {
    it(`a full report says the same thing in every format (${locale})`, async () => {
      const value = result(locale);
      const { web, pdf, word, html } = await formats({ ...fixture.report, ai_disclosure: value }, new Set(), locale);
      for (const sentence of [...sentences(value, locale), value.evidence!.quote]) {
        expect(web, sentence).toContain(sentence);
        expect(pdf, sentence).toContain(sentence);
        expect(word.some((paragraph) => paragraph.includes(sentence)), sentence).toBe(true);
      }
      // The evidence sentence: the owner's own assessment, never a legal determination.
      expect(t("aiDisclosureNote", locale)).toContain(locale === "es" ? "Evidencia para tu propia valoración, no una determinación legal." : "Evidence for your own assessment, not a legal determination.");
      const section = word.slice(word.indexOf(t("aiDisclosureTitle", locale)), word.indexOf(t("aiDisclosureContext", locale)) + 1);
      expect(section.length).toBeGreaterThan(5);
      for (const text of [web, pdf, section.join(" ")]) expect(text).not.toMatch(FORBIDDEN);
      // After the findings, as on the web report's Overview; the conversation is printed in full.
      expect(html.indexOf('data-ai-disclosure="not_disclosed"')).toBeGreaterThan(html.indexOf('class="finding"'));
      expect(pdf).toContain(t("aiDisclosureConversation", locale));
      expect(word).toContain(t("aiDisclosureConversation", locale));
      // Never part of the score: the headline is the metric either way.
      expect((await formats(fixture.report, new Set(), locale)).html.match(/<span class="big">([\s\S]*?)<\/span>/)?.[1]).toBe(html.match(/<span class="big">([\s\S]*?)<\/span>/)?.[1]);
    });

    it(`a shared copy carries it with the findings and the quote only with the results (${locale})`, async () => {
      const value = result(locale), report = { ...fixture.report, ai_disclosure: value };
      // The default share (no individual results): status and reason, no quote or conversation.
      const web = projectSharedReport(report, DEFAULT_SHARE, { disclosure: true });
      const document = redactSharedSnapshot(report, DEFAULT_SHARE, { disclosure: true });
      expect(web.ai_disclosure).toEqual({ ...value, evidence: null, transcript: [] });
      expect(document.report.ai_disclosure).toEqual(web.ai_disclosure);
      const shared = await formats(document.report, document.hidden, locale);
      const fromWeb = strip(/<section aria-labelledby="ai-disclosure-title"[\s\S]*?<\/section>/.exec(renderToStaticMarkup(createElement(ReportView, { report: web, sample: fixture.sample })))?.[0] ?? "");
      for (const sentence of sentences(value, locale)) {
        expect(fromWeb, sentence).toContain(sentence);
        expect(shared.pdf, sentence).toContain(sentence);
        expect(shared.word.some((paragraph) => paragraph.includes(sentence)), sentence).toBe(true);
      }
      for (const text of [fromWeb, shared.pdf, shared.word.join(" ")]) expect(text).not.toContain(value.evidence!.quote);
      // With the results, the quote and the conversation travel too.
      const full = redactSharedSnapshot(report, [...DEFAULT_SHARE, "results"], { disclosure: true });
      expect(projectSharedReport(report, [...DEFAULT_SHARE, "results"], { disclosure: true }).ai_disclosure).toEqual(value);
      expect((await formats(full.report, full.hidden, locale)).pdf).toContain(value.evidence!.quote);
      // Without the findings, or with the flag off, it is not shared at all.
      for (const [fields, options] of [[["system", "scope", "metrics"], { disclosure: true }], [[...DEFAULT_SHARE, "results"], {}]] as const) {
        expect(projectSharedReport(report, [...fields], options)).not.toHaveProperty("ai_disclosure");
        const hiddenCopy = redactSharedSnapshot(report, fields, options);
        expect(hiddenCopy.report).not.toHaveProperty("ai_disclosure");
        const absent = await formats(hiddenCopy.report, hiddenCopy.hidden, locale);
        expect(absent.pdf).toBe("");
        expect(absent.html).not.toContain(t("aiDisclosureTitle", locale));
        expect(absent.word).not.toContain(t("aiDisclosureTitle", locale));
      }
    });

    it(`a run without the check has no section in any format (${locale})`, async () => {
      const { web, pdf, word, html } = await formats(fixture.report, new Set(), locale);
      expect(web).toBe("");
      expect(pdf).toBe("");
      expect(html).not.toContain("data-ai-disclosure");
      expect(word).not.toContain(t("aiDisclosureTitle", locale));
    });
  }
});
