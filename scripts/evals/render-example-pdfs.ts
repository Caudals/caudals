/**
 * Renders the sample-report PDFs (launch L-33) from the example fixtures
 * with the document worker's renderer (lib/evals/reports/render.ts, the code
 * services/evals-documents runs), checks them and writes them to
 * content/sample-report with a manifest the fixture test verifies:
 *
 *   scripts/launch/heavy.sh npx tsx scripts/evals/render-example-pdfs.ts
 *
 * Needs Playwright's Chromium and poppler's pdftotext. Fails without writing
 * anything if a table overflows the page or a page lacks the Example label.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { exampleBundle, type ExampleLocale } from "../../lib/evals/example";
import { SAMPLE_REPORT_PDF_FILES } from "../../lib/evals/example/public";
import {
  renderReportHtml,
  renderReportPdf,
} from "../../lib/evals/reports/render";
import {
  layoutProblems,
  pdfPages,
  unlabelledPages,
} from "./example-pdf-checks";

async function main() {
  const directory = join(process.cwd(), "content/sample-report");
  const browser = await chromium.launch({ headless: true });
  const rendered: Array<{
    locale: ExampleLocale;
    bytes: Uint8Array;
    pages: number;
  }> = [];
  try {
    for (const locale of ["en", "es"] as const) {
      const report = exampleBundle(locale).runs[2];
      const layoutPage = await browser.newPage();
      const problems = await layoutProblems(
        layoutPage,
        renderReportHtml(report, locale, new Set(), { sample: true }),
      );
      await layoutPage.close();
      if (problems.length)
        throw new Error(
          `${locale}: ${problems.length} clipped or overflowing elements\n${JSON.stringify(problems.slice(0, 10), null, 2)}`,
        );
      const bytes = await renderReportPdf(
        report,
        async () => {
          const page = await browser.newPage();
          return { page, close: () => page.close() };
        },
        locale,
        new Set(),
        { sample: true },
      );
      const missing = unlabelledPages(bytes, locale);
      if (missing.length)
        throw new Error(
          `${locale}: pages without the Example label: ${missing.join(", ")}`,
        );
      rendered.push({ locale, bytes, pages: pdfPages(bytes).length });
    }
  } finally {
    await browser.close();
  }

  const manifest: Record<string, unknown> = {};
  for (const { locale, bytes, pages } of rendered) {
    const bundle = exampleBundle(locale),
      file = SAMPLE_REPORT_PDF_FILES[locale];
    writeFileSync(join(directory, file), bytes);
    manifest[locale] = {
      file,
      version: bundle.version,
      content_hash: bundle.runs[2].content_hash,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.byteLength,
      pages,
    };
    console.log(`wrote ${file}: ${pages} pages, ${bytes.byteLength} bytes`);
  }
  writeFileSync(
    join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
