import type { ExampleLocale } from "./bundle";

/**
 * Public addresses of the sample report. The page's internal path is
 * `/sample-report` (`/es/informe-de-ejemplo` in Spanish, see
 * lib/i18n/routing.ts); the PDFs are served outside the locale tree by
 * app/sample-report/[file]/route.ts from content/sample-report.
 */
export const SAMPLE_REPORT_PATH = "/sample-report";

export const SAMPLE_REPORT_PDF_FILES: Record<ExampleLocale, string> = {
  en: "caudals-sample-report-en.pdf",
  es: "caudals-informe-de-ejemplo-es.pdf",
};

export function samplePdfHref(locale: ExampleLocale): string {
  return `${SAMPLE_REPORT_PATH}/${SAMPLE_REPORT_PDF_FILES[locale]}`;
}

/** The in-app read-only example. */
export const EXAMPLE_EVALUATION_PATH = "/workspace/example";
