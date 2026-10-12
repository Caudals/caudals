/**
 * Release gate for the example evaluation (launch L-33). Runs in the image
 * build (Dockerfile) as well as with the other unit tests.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reportSnapshotSchema, type ReportSnapshot } from "../reports/contracts";
import { verifyContentHash } from "../contracts/hashing";
import { buildExampleBundle, EXAMPLE_CASES } from "./build";
import { exampleBundle, exampleView } from "./index";
import { SAMPLE_REPORT_PDF_FILES } from "./public";
import { serializeExampleBundle } from "./serialize";
import { EXAMPLE_COMPANY } from "./source/company";
import { sampleReportCopy } from "./page-copy";

const LOCALES = ["en", "es"] as const;
const root = process.cwd();

/** Every string in a value, for wording checks. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

// Real insurers, banks and public bodies that must never appear in the fictitious example.
const REAL_NAMES = [
  "mapfre", "mutua", "línea directa", "linea directa", "allianz", "axa", "generali", "zurich", "santalucía", "santalucia", "ocaso",
  "reale", "pelayo", "caser", "helvetia", "liberty", "catalana occidente", "plus ultra", "fiatc", "verti", "génesis", "genesis",
  "sanitas", "dkv", "adeslas", "asisa", "aegon", "segurcaixa", "vidacaixa", "caixabank", "bbva", "santander", "bankinter",
  "sabadell", "ibercaja", "unicaja", "kutxabank", "abanca", "consorcio", "aviva", "ergo", "arag", "hiscox", "markel",
  "nationale-nederlanden", "metlife", "cardif", "occident", "balumba", "qualitas", "dgsfp",
];

describe("example evaluation fixtures", () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const bundle = exampleBundle(locale);

      it("are the committed output of the builder", () => {
        const committed = readFileSync(join(root, `lib/evals/example/fixtures/${locale}.json`), "utf8");
        expect(committed).toBe(serializeExampleBundle(buildExampleBundle(locale)));
      });

      it("parse with reportSnapshotSchema and keep their content hashes", () => {
        expect(bundle.runs).toHaveLength(3);
        for (const run of bundle.runs) {
          expect(() => reportSnapshotSchema.parse(run)).not.toThrow();
          expect(() => verifyContentHash(run)).not.toThrow();
          expect(run.scope.languages).toEqual([locale]);
        }
      });

      it("show three monthly runs on one frozen test set, the last one reviewed", () => {
        const [august, september, october] = bundle.runs;
        expect(new Set(bundle.runs.map((run) => run.scope.suite_version_id)).size).toBe(1);
        expect(new Set(bundle.runs.map((run) => run.run_id)).size).toBe(3);
        expect(Date.parse(august.scope.started_at)).toBeLessThan(Date.parse(september.scope.started_at));
        expect(Date.parse(september.scope.started_at)).toBeLessThan(Date.parse(october.scope.started_at));
        expect(october.scope.review_status).toBe("reviewed");
        expect(october.metrics.headline_status).toBe("complete");
        expect(october.results.every((result) => result.review_status === "approved")).toBe(true);
        const rates = bundle.trend.map((point) => point.strict_pass_rate ?? 0);
        expect(rates[0]).toBeLessThan(rates[1]);
        expect(rates[1]).toBeLessThan(rates[2]);
        expect(bundle.trend.map((point) => point.run_id)).toEqual(bundle.runs.map((run) => run.run_id));
      });

      it("has 40–60 results with transcripts and cited source excerpts", () => {
        for (const run of bundle.runs) {
          expect(run.results.length).toBeGreaterThanOrEqual(40);
          expect(run.results.length).toBeLessThanOrEqual(60);
          for (const result of run.results) {
            expect(result.input.trim()).not.toBe("");
            expect(result.output.trim()).not.toBe("");
            expect(result.expected?.trim()).toBeTruthy();
            expect(result.source_excerpts?.length).toBeGreaterThan(0);
            for (const excerpt of result.source_excerpts ?? []) expect(result.source_refs).toContainEqual({ source_revision_id: excerpt.source_revision_id, anchor: excerpt.anchor });
            expect(run.methodology.source_revisions).toEqual(expect.arrayContaining(result.source_refs.map((ref) => ref.source_revision_id)));
          }
        }
      });

      it("cites results that exist from every takeaway and finding", () => {
        for (const run of bundle.runs) {
          const results = new Map(run.results.map((result) => [result.assessment_id, result]));
          const findings = new Set(run.findings.map((finding) => finding.id));
          expect(run.findings.length).toBeGreaterThan(0);
          for (const finding of run.findings) {
            expect(finding.assessment_ids.length).toBeGreaterThan(0);
            expect(finding.frequency_n).toBe(finding.assessment_ids.length);
            expect(finding.frequency_n).toBeLessThanOrEqual(finding.frequency_denominator);
            for (const id of finding.assessment_ids) expect(["fail", "partial"]).toContain(results.get(id)?.outcome);
          }
          expect(run.takeaways.length).toBeGreaterThan(0);
          for (const takeaway of run.takeaways) {
            expect(takeaway.finding_ids.length + takeaway.assessment_ids.length).toBeGreaterThan(0);
            for (const id of takeaway.finding_ids) expect(findings.has(id)).toBe(true);
            for (const id of takeaway.assessment_ids) expect(results.has(id)).toBe(true);
          }
          for (const improvement of run.improvements) for (const id of improvement.finding_ids) expect(findings.has(id)).toBe(true);
        }
      });

      it("covers every failed or partial October result with a finding", () => {
        const october = bundle.runs[2];
        const cited = new Set(october.findings.flatMap((finding) => finding.assessment_ids));
        for (const result of october.results.filter((item) => item.outcome === "fail" || item.outcome === "partial")) expect(cited.has(result.assessment_id)).toBe(true);
        expect(october.improvements.length).toBeGreaterThan(0);
        for (const finding of october.findings) expect(finding.cause_hypothesis).toBeTruthy();
      });

      it("compares September and October on paired questions", () => {
        const { comparison } = bundle, [, september, october] = bundle.runs;
        expect(comparison.baseline_run_id).toBe(september.run_id);
        expect(comparison.candidate_run_id).toBe(october.run_id);
        expect(comparison.improved + comparison.regressed + comparison.unchanged + comparison.unassessed).toBe(october.results.length);
        expect(comparison.improved).toBeGreaterThan(0);
        expect(comparison.regressed).toBeGreaterThan(0);
        expect(comparison.unchanged).toBeGreaterThan(0);
        expect(comparison.changes.filter((change) => change.direction === "improved")).toHaveLength(comparison.improved);
        expect(comparison.changes.filter((change) => change.direction === "regressed")).toHaveLength(comparison.regressed);
        const latest = new Set(october.results.map((result) => result.assessment_id));
        for (const change of comparison.changes) expect(latest.has(change.assessment_id)).toBe(true);
      });

      it("names only the fictitious company and makes no certification claims", () => {
        const text = strings(bundle).join("\n");
        expect(text).not.toMatch(/\{co\}|\{product\}/);
        expect(text).toContain(EXAMPLE_COMPANY.name);
        const lower = text.toLowerCase();
        for (const name of REAL_NAMES) expect(lower, name).not.toMatch(new RegExp(`(^|[^\\p{L}])${name}([^\\p{L}]|$)`, "u"));
        expect(lower).not.toMatch(/certif|complian|cumplimiento normativo|conformidad/);
        expect(lower).toContain(locale === "en" ? "no real expert" : "ningún experto real");
      });

      it("exposes the reviewed report as the page view", () => {
        const view = exampleView(locale);
        expect(view.report).toBe(bundle.runs[2]);
        expect(view.trend).toHaveLength(3);
      });
    });
  }

  it("keeps the English and Spanish fixtures structurally identical", () => {
    const [en, es] = LOCALES.map((locale) => exampleBundle(locale));
    expect(en.comparison.changes.map((change) => change.case_revision_id)).toEqual(es.comparison.changes.map((change) => change.case_revision_id));
    for (let index = 0; index < 3; index++) {
      const a: ReportSnapshot = en.runs[index], b: ReportSnapshot = es.runs[index];
      expect(b.metrics).toEqual(a.metrics);
      expect(b.results.map((result) => [result.case_revision_id, result.assessment_id, result.label, result.severity, result.failure_category, result.likely_cause])).toEqual(
        a.results.map((result) => [result.case_revision_id, result.assessment_id, result.label, result.severity, result.failure_category, result.likely_cause]),
      );
      expect(b.findings.map((finding) => [finding.id, finding.assessment_ids])).toEqual(a.findings.map((finding) => [finding.id, finding.assessment_ids]));
      expect(b.takeaways.map((takeaway) => [takeaway.finding_ids, takeaway.assessment_ids])).toEqual(a.takeaways.map((takeaway) => [takeaway.finding_ids, takeaway.assessment_ids]));
    }
    expect(new Set(EXAMPLE_CASES.map((item) => item.id)).size).toBe(EXAMPLE_CASES.length);
  });

  it("has the public page copy in both languages, with the same slots", () => {
    const flatten = (value: unknown, prefix = ""): Array<[string, string]> =>
      typeof value === "string" ? [[prefix, value]] : Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key));
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const [en, es] = LOCALES.map((locale) => new Map(flatten(sampleReportCopy(locale))));
    expect([...es.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, value] of en) {
      expect(value.trim(), key).not.toBe("");
      expect(es.get(key)!.trim(), key).not.toBe("");
      expect(slots(es.get(key)!), key).toEqual(slots(value));
    }
    expect(sampleReportCopy("en").syntheticLine).toBe("Synthetic data about a fictitious company. It shows what a reviewed report looks like; no real expert reviewed it.");
    expect(sampleReportCopy("es").label).toBe("Ejemplo");
    expect(JSON.stringify([sampleReportCopy("en"), sampleReportCopy("es")]).toLowerCase()).not.toMatch(/certif|complian|cumplimiento normativo/);
  });

  it("ships PDFs rendered from the current fixtures", () => {
    const manifest = JSON.parse(readFileSync(join(root, "content/sample-report/manifest.json"), "utf8")) as Record<string, { file: string; content_hash: string; sha256: string; pages: number; version: string }>;
    for (const locale of LOCALES) {
      const entry = manifest[locale], report = exampleBundle(locale).runs[2];
      expect(entry.file).toBe(SAMPLE_REPORT_PDF_FILES[locale]);
      expect(entry.version).toBe(exampleBundle(locale).version);
      expect(entry.content_hash, "re-render the PDFs: npx tsx scripts/evals/render-example-pdfs.ts").toBe(report.content_hash);
      const bytes = readFileSync(join(root, "content/sample-report", entry.file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(entry.pages).toBeGreaterThan(1);
    }
  });
});
