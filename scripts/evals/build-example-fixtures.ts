/**
 * Writes the example evaluation fixtures (launch L-33) from the bilingual
 * source in lib/evals/example/source:
 *
 *   npx tsx scripts/evals/build-example-fixtures.ts
 *
 * Then re-render the sample-report PDFs (scripts/evals/render-example-pdfs.ts):
 * the fixture test fails while the committed PDFs belong to older fixtures.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildExampleBundle } from "../../lib/evals/example/build";
import { serializeExampleBundle } from "../../lib/evals/example/serialize";

const directory = join(process.cwd(), "lib/evals/example/fixtures");
for (const locale of ["en", "es"] as const) {
  const path = join(directory, `${locale}.json`);
  writeFileSync(path, serializeExampleBundle(buildExampleBundle(locale)));
  console.log(`wrote ${path}`);
}
