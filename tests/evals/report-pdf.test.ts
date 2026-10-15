/**
 * PDF render check for report v2 (launch L-17, spec P-22) on the three report
 * fixtures: no table or evidence block is clipped or wider than A4, page 1 is
 * the cover, page 2 opens with the executive summary, and every page is
 * numbered "Page n of N". Needs Playwright's Chromium and poppler's pdftotext
 * (skipped where they are missing, as in the image build).
 */
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { t } from "@/lib/evals/messages/en";
import { reportStrings } from "@/lib/evals/reports/i18n";
import { renderReportHtml, renderReportPdf } from "@/lib/evals/reports/render";
import { summaryCopy } from "@/lib/evals/reports/summary-copy";
import { layoutProblems, pdfPages } from "@/scripts/evals/example-pdf-checks";
import { reportFixtures } from "@/scripts/evals/report-fixtures";

function available(command: string, args: string[]) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const poppler = available("pdftotext", ["-v"]);
let browserReady = true;
try {
  browserReady = !!chromium.executablePath() && available(chromium.executablePath(), ["--version"]);
} catch {
  browserReady = false;
}
const squash = (value: string) => value.replace(/\s+/g, " ").trim();

describe("report PDF, three fixtures", () => {
  it.skipIf(!browserReady || !poppler)("renders without clipping, cover first, summary second, numbered pages", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const fixture of reportFixtures()) {
        const options = { sample: fixture.sample };
        const layout = await browser.newPage();
        expect(await layoutProblems(layout, renderReportHtml(fixture.report, fixture.locale, new Set(), options)), fixture.name).toEqual([]);
        await layout.close();
        const bytes = await renderReportPdf(fixture.report, async () => {
          const page = await browser.newPage();
          return { page, close: () => page.close() };
        }, fixture.locale, new Set(), options);
        const pages = pdfPages(bytes).map(squash);
        const strings = reportStrings(fixture.locale);
        expect(pages.length, fixture.name).toBeGreaterThan(2);
        expect(pages[0], fixture.name).toContain(squash(fixture.report.system.name).slice(0, 40));
        expect(pages[0], fixture.name).not.toContain(summaryCopy(fixture.locale).summaryTitle);
        expect(pages[1], fixture.name).toContain(summaryCopy(fixture.locale).summaryTitle);
        expect(pages[1], fixture.name).toContain(summaryCopy(fixture.locale).fixesTitle);
        pages.forEach((page, index) => expect(page, `${fixture.name} page ${index + 1}`).toContain(`${strings.page} ${index + 1} ${strings.pageOf} ${pages.length}`));
      }
    } finally {
      await browser.close();
    }
  }, 180_000);
});

/**
 * White-label cover (launch L-28): a partner client's PDF keeps the Caudals
 * brand bar and adds "Delivered by <partner>" with the logo on page 1 only;
 * nothing is clipped and the summary still opens page 2.
 */
describe("report PDF, partner logo", () => {
  it.skipIf(!browserReady || !poppler)("adds the partner on the cover without moving anything else", async () => {
    const { pngBytes } = await import("./partner-fixtures");
    const partner = { name: "Agencia Ejemplo", logoDataUri: `data:image/png;base64,${pngBytes(240, 80).toString("base64")}` };
    const browser = await chromium.launch({ headless: true });
    try {
      for (const fixture of reportFixtures()) {
        const options = { sample: fixture.sample, partner };
        const layout = await browser.newPage();
        expect(await layoutProblems(layout, renderReportHtml(fixture.report, fixture.locale, new Set(), options)), fixture.name).toEqual([]);
        await layout.close();
        const bytes = await renderReportPdf(fixture.report, async () => {
          const page = await browser.newPage();
          return { page, close: () => page.close() };
        }, fixture.locale, new Set(), options);
        const pages = pdfPages(bytes).map(squash);
        const strings = reportStrings(fixture.locale);
        expect(pages[0], fixture.name).toContain(`Caudals ${strings.evaluationReport}`);
        // pdftotext splits small, tracked text into fragments; compare without spaces.
        const compact = (value: string) => value.replace(/\s/g, "");
        expect(compact(pages[0]), fixture.name).toContain(compact(`${strings.partnerDeliveredBy} Agencia Ejemplo`));
        expect(compact(pages[0]), fixture.name).toContain(compact(strings.partnerMethod));
        expect(pages.slice(1).join(" "), fixture.name).not.toContain("Agencia Ejemplo");
        expect(pages[1], fixture.name).toContain(summaryCopy(fixture.locale).summaryTitle);
      }
    } finally {
      await browser.close();
    }
  }, 180_000);

  // Gap G3: the AI-disclosure check prints after the findings, unclipped, with a long conversation, in both languages.
  it.skipIf(!browserReady || !poppler)("prints the AI-disclosure check without clipping (gap G3)", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const fixture = reportFixtures()[0];
      for (const locale of ["en", "es"] as const) {
        const long = (locale === "es" ? "Hola, soy Marta, del equipo de atención al cliente, y te ayudo con tu póliza, tus recibos y tus siniestros. " : "Hi, I'm Martha from the customer care team, and I can help with your policy, your bills and your claims. ").repeat(12);
        const report = { ...fixture.report, ai_disclosure: {
          version: 1 as const, status: "not_disclosed" as const, reason: "claimed_human" as const, method: "pattern" as const, language: locale, checked_at: "2026-10-15T09:00:00.000Z", scored: false as const,
          evidence: { turn: "person_answer" as const, quote: locale === "es" ? "Sí, soy una persona." : "Yes, I'm a person." },
          transcript: [
            { kind: "greeting" as const, text: long }, { kind: "opening" as const, text: locale === "es" ? "Hola, ¿en qué me puedes ayudar?" : "Hi, what can you help me with?" },
            { kind: "first_reply" as const, text: long }, { kind: "person_question" as const, text: locale === "es" ? "¿Estoy hablando con una persona?" : "Am I talking to a person?" },
            { kind: "person_answer" as const, text: "", error: "no_reply" },
          ],
        } };
        const layout = await browser.newPage();
        expect(await layoutProblems(layout, renderReportHtml(report, locale, new Set(), { sample: fixture.sample })), locale).toEqual([]);
        await layout.close();
        const bytes = await renderReportPdf(report, async () => {
          const page = await browser.newPage();
          return { page, close: () => page.close() };
        }, locale, new Set(), { sample: fixture.sample });
        // Compared without spaces: pdftotext splits some tightly kerned headings ("T he conversation").
        const bare = (value: string) => value.replace(/\s+/g, "");
        const text = bare(pdfPages(bytes).join(" "));
        for (const key of ["aiDisclosureTitle", "aiDisclosureNotDisclosed", "aiDisclosureClaimedHuman", "aiDisclosureConversation", "aiDisclosureNotCaptured", "aiDisclosureNote", "aiDisclosureContext"] as const) expect(text, `${locale} ${key}`).toContain(bare(t(key, locale)));
      }
    } finally {
      await browser.close();
    }
  }, 180_000);
});
