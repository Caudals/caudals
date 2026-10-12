/**
 * The example evaluation (launch L-33, spec P-55): one synthetic, clearly
 * labelled evaluation of a fictitious insurer's home-policy assistant, shown
 * read-only in every workspace (`/workspace/example`) and publicly as the
 * sample report (`/{locale}/sample-report` and its PDF).
 *
 * It lives only in these versioned fixtures, never in the database, so it
 * cannot be run, edited, shared, scheduled or deleted, and it never counts
 * towards plan limits, credits, product metrics or activation. No API route
 * imports this module (tests/evals/example-evaluation-guard.test.ts).
 *
 * Browser-safe: client components and the UI harness may import it.
 */
import en from "./fixtures/en.json";
import es from "./fixtures/es.json";
import type { ExampleBundle, ExampleLocale } from "./bundle";

export type { ExampleBundle, ExampleChange, ExampleComparison, ExampleLocale, ExampleTrendPoint } from "./bundle";

const BUNDLES: Record<ExampleLocale, ExampleBundle> = {
  en: en as unknown as ExampleBundle,
  es: es as unknown as ExampleBundle,
};

export function exampleBundle(locale: ExampleLocale): ExampleBundle {
  return BUNDLES[locale];
}

/** What a page renders: the reviewed (latest) report, the three-run trend and the comparison. */
export type ExampleView = Omit<ExampleBundle, "runs"> & { report: ExampleBundle["runs"][2] };

export function exampleView(locale: ExampleLocale): ExampleView {
  const { runs, ...rest } = exampleBundle(locale);
  return { ...rest, report: runs[runs.length - 1] };
}
