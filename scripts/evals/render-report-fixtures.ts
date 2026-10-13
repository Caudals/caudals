/**
 * Visual check of the report documents (launch L-17, spec P-22): renders the
 * three report fixtures (./report-fixtures.ts) to PDF and Word with the
 * document worker's renderers, refuses any clipped or overflowing table, and
 * writes the files plus PNG previews of the first pages for a person to look at:
 *
 *   scripts/launch/heavy.sh npx tsx scripts/evals/render-report-fixtures.ts [out-dir]
 *
 * Needs Playwright's Chromium; previews need poppler's pdftoppm.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { renderReportDocx } from "../../lib/evals/reports/docx";
import { renderReportHtml, renderReportPdf } from "../../lib/evals/reports/render";
import { layoutProblems, pdfPages } from "./example-pdf-checks";
import { reportFixtures } from "./report-fixtures";

async function main() {
  const out = process.argv[2] ?? "/tmp/caudals-report-fixtures";
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let failed = false;
  try {
    for (const fixture of reportFixtures()) {
      const options = { sample: fixture.sample };
      const layout = await browser.newPage();
      const problems = await layoutProblems(layout, renderReportHtml(fixture.report, fixture.locale, new Set(), options));
      await layout.close();
      const bytes = await renderReportPdf(fixture.report, async () => {
        const page = await browser.newPage();
        return { page, close: () => page.close() };
      }, fixture.locale, new Set(), options);
      const pdf = join(out, `${fixture.name}.pdf`);
      writeFileSync(pdf, bytes);
      writeFileSync(join(out, `${fixture.name}.docx`), await renderReportDocx(fixture.report, fixture.locale));
      try {
        execFileSync("pdftoppm", ["-r", "60", "-f", "1", "-l", "3", "-png", pdf, join(out, fixture.name)]);
      } catch {
        // Previews are optional.
      }
      console.log(`${fixture.name}: ${pdfPages(bytes).length} pages, ${problems.length} layout problems`);
      if (problems.length) {
        failed = true;
        console.log(JSON.stringify(problems.slice(0, 10), null, 2));
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`Files in ${out}`);
  if (failed) process.exitCode = 1;
}

void main();
