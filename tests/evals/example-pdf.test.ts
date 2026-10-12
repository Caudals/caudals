/**
 * PDF render check for the sample report (launch L-33): the document fits A4
 * with no clipped or overflowing table, and every page of the committed PDFs
 * carries the Example label and the synthetic-data line. Needs Playwright's
 * Chromium and poppler's pdftotext (skipped where they are missing, as in the
 * image build).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { exampleBundle } from "@/lib/evals/example";
import { SAMPLE_REPORT_PDF_FILES } from "@/lib/evals/example/public";
import { renderReportHtml } from "@/lib/evals/reports/render";
import { layoutProblems, pdfPages, unlabelledPages } from "@/scripts/evals/example-pdf-checks";

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

describe("sample report PDF", () => {
  for (const locale of ["en", "es"] as const) {
    it.skipIf(!poppler)(`${locale}: every committed page carries the Example label`, () => {
      const manifest = JSON.parse(readFileSync(join(process.cwd(), "content/sample-report/manifest.json"), "utf8"));
      const bytes = readFileSync(join(process.cwd(), "content/sample-report", SAMPLE_REPORT_PDF_FILES[locale]));
      expect(unlabelledPages(bytes, locale)).toEqual([]);
      expect(pdfPages(bytes)).toHaveLength(manifest[locale].pages);
    });

    it.skipIf(!browserReady)(`${locale}: no table or evidence block overflows the A4 page`, async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const problems = await layoutProblems(page, renderReportHtml(exampleBundle(locale).runs[2], locale, new Set(), { sample: true }));
        expect(problems).toEqual([]);
      } finally {
        await browser.close();
      }
    }, 60_000);
  }
});
