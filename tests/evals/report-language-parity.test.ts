/**
 * EN/ES parity of the report exports (launch L-23, spec P-45): a Spanish
 * report's PDF and Word documents carry no English wording, and an English
 * one no Spanish. The labels, the executive summary, the fixes and the
 * sentences Caudals generates come from the language tables; the report's
 * own content (questions, answers, model text) keeps its words, so each
 * fixture is rendered in the language it was written in.
 */
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { exampleBundle } from "@/lib/evals/example";
import { setLocale } from "@/lib/evals/messages/en";
import { renderReportDocx } from "@/lib/evals/reports/docx";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";
import { reportStrings, type ReportLocale } from "@/lib/evals/reports/i18n";
import { renderReportHtml } from "@/lib/evals/reports/render";
import { SUMMARY_COPY } from "@/lib/evals/reports/summary-copy";
import { reportFixtures } from "@/scripts/evals/report-fixtures";

const unescape = (value: string) =>
  value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

function pdfText(html: string) {
  return unescape(html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}
async function wordText(bytes: Buffer) {
  const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
  return unescape([...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(" ")).replace(/\s+/g, " ");
}

function strings(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (Array.isArray(tree)) return tree.flatMap(strings);
  if (tree && typeof tree === "object") return Object.values(tree).flatMap(strings);
  return [];
}

/** Fixed wording of one language that the other language words differently, cut at its {slots}. */
function fragments(locale: ReportLocale) {
  const other: ReportLocale = locale === "en" ? "es" : "en";
  const own = [...strings(reportStrings(locale)), ...strings(SUMMARY_COPY[locale])];
  const theirs = new Set([...strings(reportStrings(other)), ...strings(SUMMARY_COPY[other])]);
  return [...new Set(own
    .filter((value) => !theirs.has(value))
    .flatMap((value) => value.split(/\{\w+\}/))
    .map((part) => part.replace(/\s+/g, " ").replace(/^[\s.,:;·()—–-]+|[\s.,:;·()—–-]+$/g, ""))
    .filter((part) => (part.match(/\p{L}{2,}/gu) ?? []).length >= 2))];
}

/** The fragment as whole words ("on Caudals" is not inside "con Caudals"). */
const wholeWords = (fragment: string) => new RegExp(`(?<![\\p{L}\\p{N}])${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u");

/** Common words that only one of the two languages uses. */
const FUNCTION_WORDS: Record<ReportLocale, RegExp> = {
  en: /(?<![\p{L}])(the|and|with|which|from|this|that|were|your|their|have|has|been|should|could)(?![\p{L}])/giu,
  es: /(?<![\p{L}])(los|las|del|para|con|una|que|por|este|esta|sus|tiene|han|sido|debe)(?![\p{L}])/giu,
};

type Fixture = { name: string; locale: ReportLocale; sample: boolean; report: ReportSnapshot };
const fixtures: Fixture[] = [
  ...reportFixtures(),
  { name: "example-es", locale: "es", sample: true, report: exampleBundle("es").runs[2] as ReportSnapshot },
];

afterAll(() => setLocale("en"));

describe("report exports speak one language", () => {
  for (const fixture of fixtures) {
    it(`${fixture.name}: PDF and Word carry no ${fixture.locale === "es" ? "English" : "Spanish"} wording`, async () => {
      setLocale(fixture.locale);
      const other: ReportLocale = fixture.locale === "es" ? "en" : "es";
      const options = { sample: fixture.sample };
      const documents = {
        pdf: pdfText(renderReportHtml(fixture.report, fixture.locale, new Set(), options)),
        word: await wordText(await renderReportDocx(fixture.report, fixture.locale, new Set(), options)),
      };
      const foreign = fragments(other);
      for (const [format, text] of Object.entries(documents)) {
        expect(foreign.filter((fragment) => wholeWords(fragment).test(text)), `${format}: wording from the ${other} tables`).toEqual([]);
        expect([...new Set([...text.matchAll(FUNCTION_WORDS[other])].map((match) => match[0].toLowerCase()))], `${format}: ${other} words`).toEqual([]);
      }
    });
  }
});
