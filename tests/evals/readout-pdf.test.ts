/**
 * Readout PDF render check (launch L-35, spec P-57, §5.5): the three report
 * fixtures in English and Spanish render one 16:9 page per slide with no
 * clipped slide, numbered pages, body text at projector size, the report's
 * numbers, and no presenter note anywhere in the text (read back with
 * poppler's pdftotext). Needs Playwright's Chromium and poppler (skipped where
 * they are missing, as in the image build).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { buildReadoutDeck, defaultNote } from "@/lib/evals/reports/readout";
import { READOUT_PAGE, renderReadoutHtml, renderReadoutPdf } from "@/lib/evals/reports/readout-pdf";
import { pdfPages } from "@/scripts/evals/example-pdf-checks";
import { reportFixtures } from "@/scripts/evals/report-fixtures";
import { slideProblems } from "@/scripts/evals/readout-checks";

function available(command: string, args: string[]) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const poppler = available("pdftotext", ["-v"]) && available("pdfinfo", ["-v"]);
let browserReady = true;
try {
  browserReady = !!chromium.executablePath() && available(chromium.executablePath(), ["--version"]);
} catch {
  browserReady = false;
}
const squash = (value: string) => value.replace(/\s+/g, " ").trim();
function pageSize(bytes: Uint8Array) {
  const directory = mkdtempSync(join(tmpdir(), "caudals-readout-pdf-"));
  try {
    writeFileSync(join(directory, "readout.pdf"), bytes);
    const info = execFileSync("pdfinfo", [join(directory, "readout.pdf")], { encoding: "utf8" });
    const match = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info);
    return { width: Number(match?.[1]), height: Number(match?.[2]), pages: Number(/Pages:\s+(\d+)/.exec(info)?.[1]) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("readout PDF, three fixtures", () => {
  it.skipIf(!browserReady || !poppler)("one 16:9 page per slide, nothing clipped, numbers from the report, no notes", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const fixture of reportFixtures()) {
        for (const locale of ["en", "es"] as const) {
          const name = `${fixture.name} (${locale})`;
          const deck = buildReadoutDeck(fixture.report, locale, { sample: fixture.sample });

          // Layout at the page size: no slide clipped or overflowing, body text 24 px or more.
          const layout = await browser.newPage({ viewport: { width: READOUT_PAGE.width, height: READOUT_PAGE.height } });
          await layout.emulateMedia({ media: "print" });
          await layout.setContent(renderReadoutHtml(deck), { waitUntil: "load" });
          expect(await slideProblems(layout), name).toEqual([]);
          const smallest = await layout.evaluate(() =>
            Math.min(...Array.from(document.querySelectorAll<HTMLElement>(".rd-quote,.rd-excerpt,[data-why],.rd-sentences li,.rd-row > span:first-child,.rd-fix-title,.rd-points li,.rd-purpose,.rd-lead,[data-cover]")).map((element) => parseFloat(getComputedStyle(element).fontSize))),
          );
          expect(smallest, name).toBeGreaterThanOrEqual(24);
          await layout.close();

          const bytes = await renderReadoutPdf(deck, async () => {
            const page = await browser.newPage();
            return { page, close: () => page.close() };
          });
          const size = pageSize(bytes);
          expect(size.pages, name).toBe(deck.slides.length);
          // 1280 × 720 CSS px = 960 × 540 pt: 16:9.
          expect(size.width / size.height, name).toBeCloseTo(16 / 9, 2);

          const pages = pdfPages(bytes).map(squash);
          expect(pages.length, name).toBe(deck.slides.length);
          pages.forEach((page, index) => expect(page, `${name} page ${index + 1}`).toContain(`${index + 1} / ${deck.slides.length}`));
          const verdict = deck.slides[1];
          if (verdict.kind === "verdict" && verdict.percentText) expect(pages[1], name).toContain(verdict.percentText);
          deck.slides.forEach((slide, index) => {
            if (slide.kind === "transcript") expect(pages[index], name).toContain(`T${slide.number}`);
          });
          // The PDF never contains a presenter note: not even the default script.
          const text = pages.join(" ");
          for (const slide of deck.slides) expect(text, name).not.toContain(squash(defaultNote(slide, locale)).slice(0, 40));
        }
      }
    } finally {
      await browser.close();
    }
  }, 240_000);

  it.skipIf(!browserReady)("the layout check catches a slide whose text does not fit", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const fixture = reportFixtures()[0];
      const deck = buildReadoutDeck(fixture.report, "en", { sample: true });
      const index = deck.slides.findIndex((slide) => slide.kind === "transcript");
      const slide = deck.slides[index];
      if (slide.kind !== "transcript") throw new Error("no transcript slide");
      deck.slides[index] = { ...slide, answer: { text: "A long answer that never ends. ".repeat(60), shortened: false } };
      const page = await browser.newPage({ viewport: { width: READOUT_PAGE.width, height: READOUT_PAGE.height } });
      await page.setContent(renderReadoutHtml(deck), { waitUntil: "load" });
      expect((await slideProblems(page)).some((problem) => problem.slide === slide.key)).toBe(true);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
