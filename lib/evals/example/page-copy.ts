import en from "@/content/sample-report/en.json";
import es from "@/content/sample-report/es.json";
import type { ExampleLocale } from "./bundle";

/**
 * Copy of the public sample report page (`/{locale}/sample-report`). It lives
 * in content/sample-report rather than lib/i18n/messages because only this
 * server-rendered page reads it: the public message catalogues ship to every
 * visitor's browser. `es.json` is type-checked against `en.json`, and
 * lib/evals/example/example.test.ts checks keys, blanks and placeholders.
 */
export type SampleReportCopy = typeof en;

const COPY: Record<ExampleLocale, SampleReportCopy> = { en, es: es satisfies SampleReportCopy };

export function sampleReportCopy(locale: ExampleLocale): SampleReportCopy {
  return COPY[locale];
}

/** Fill `{name}` slots; an unknown slot stays visible rather than blank. */
export function fillCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
