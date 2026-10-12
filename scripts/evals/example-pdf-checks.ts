/**
 * Checks for the sample-report PDF (launch L-33), shared by the renderer
 * script and the Playwright contract:
 *
 * - layout: rendered at the A4 content width, no table, preformatted block or
 *   evidence card is wider than the page or clips its text;
 * - labels: every page of the PDF carries "Example"/"Ejemplo" and the
 *   synthetic-data line (read back with poppler's pdftotext).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { reportStrings, type ReportLocale } from "../../lib/evals/reports/i18n";

/** A4 (210 mm) minus 16 mm side margins, at 96 px per inch. */
export const A4_CONTENT_WIDTH_PX = Math.floor(((210 - 32) / 25.4) * 96);

export type LayoutProblem = { selector: string; text: string; scrollWidth: number; clientWidth: number; right: number };

/** Loads the report HTML at print width and lists every element that overflows or clips. */
export async function layoutProblems(page: Page, html: string): Promise<LayoutProblem[]> {
  await page.setViewportSize({ width: A4_CONTENT_WIDTH_PX, height: 1100 });
  await page.emulateMedia({ media: "print" });
  await page.setContent(html, { waitUntil: "load" });
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1;
    const problems: Array<{ selector: string; text: string; scrollWidth: number; clientWidth: number; right: number }> = [];
    const selectors = ["table", "th", "td", "pre", ".evidence", ".finding", ".meta", ".kpis", ".denoms", ".defs", ".legend", ".sample", ".takeaways li"];
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        const rect = element.getBoundingClientRect();
        const clipped = element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== "visible";
        const wide = rect.right > limit || element.scrollWidth > limit;
        if (clipped || wide) problems.push({ selector, text: (element.textContent ?? "").trim().slice(0, 80), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, right: Math.round(rect.right) });
      }
    }
    return problems;
  });
}

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

/** The text of each page, via pdftotext (form feeds separate pages). */
export function pdfPages(bytes: Uint8Array): string[] {
  const directory = mkdtempSync(join(tmpdir(), "caudals-example-pdf-"));
  try {
    const path = join(directory, "report.pdf");
    writeFileSync(path, bytes);
    const text = execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
    return text.split("\f").filter((page) => page.trim().length > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Pages (1-based) that are missing the label or the synthetic-data line. */
export function unlabelledPages(bytes: Uint8Array, locale: ReportLocale): number[] {
  const strings = reportStrings(locale), note = squash(strings.sampleNote);
  return pdfPages(bytes).flatMap((page, index) => {
    const text = squash(page);
    return text.includes(strings.sampleLabel) && text.includes(note) ? [] : [index + 1];
  });
}
