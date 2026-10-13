/**
 * Writes the help-centre index (launch L-20) from the Markdown articles in
 * content/help/{en,es}:
 *
 *   npx tsx scripts/evals/build-help.ts
 *
 * Run it after editing an article. The content lint
 * (lib/evals/help/content.test.ts, part of the image build) fails while the
 * committed JSON does not match the Markdown.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildHelpIndex, HELP_LOCALES, serializeHelpIndex } from "../../lib/evals/help/source";

const directory = join(process.cwd(), "lib/evals/help/generated");
for (const locale of HELP_LOCALES) {
  const path = join(directory, `${locale}.json`);
  writeFileSync(path, serializeHelpIndex(buildHelpIndex(locale)));
  console.log(`wrote ${path}`);
}
