/**
 * The fictitious company behind the example evaluation.
 *
 * Invented for the example: it must match no real insurer or brand. Before
 * the sample report is linked publicly the founder checks the name against
 * the DGSFP register of insurers and a trademark search (docs/launch/PROGRESS.md
 * §5). Renaming is this one constant; rebuild the fixtures and PDFs afterwards
 * (`npx tsx scripts/evals/build-example-fixtures.ts`).
 */
export const EXAMPLE_COMPANY = {
  name: "Hogarel",
  product: "Hogar Completo",
} as const;

/** Version of the example content. Bump it whenever the fixture text changes. */
export const EXAMPLE_VERSION = "2026-10-12.1";
