/**
 * Executive summary and "Fix these first" (launch L-17, spec P-18, P-20):
 * snapshot of what each fixture says, then the guarantees behind it — every
 * sentence has result ids, its numbers are the metrics, causes are labelled
 * hypotheses, and the EN/ES wording is complete and claim-free.
 */
import { describe, expect, it } from "vitest";
import { reportFixtures } from "@/scripts/evals/report-fixtures";
import { reportDownloadName } from "./file-name";
import { FIX_PROBLEMS, buildFixes, failingCsv, fixesCsv, fixesMarkdown, isFailing, problemOf, testRefs } from "./fixes";
import { localizeReportText } from "./i18n";
import { FINDING_COPY } from "./results";
import { buildExecutiveSummary } from "./summary";
import { SUMMARY_COPY } from "./summary-copy";
import { projectSharedReport } from "./shares";

const fixtures = reportFixtures();

describe("executive summary", () => {
  for (const fixture of fixtures) {
    for (const locale of ["en", "es"] as const) {
      const report = fixture.report;
      const summary = buildExecutiveSummary(report, locale, { sample: fixture.sample })!;

      it(`${fixture.name} (${locale}) matches its snapshot`, () => {
        expect({
          percent: summary.percentText,
          sentences: summary.sentences.map((item) => ({ key: item.key, text: item.text, evidence: item.assessment_ids.length })),
          sample: summary.sample,
          status: summary.status.map((item) => `${item.label}: ${item.text}`),
          fixes: summary.fixes.map((fix) => ({ rank: fix.rank, title: fix.title, basis: fix.basis, answers: fix.assessment_ids.length, severity: fix.severity })),
        }).toMatchSnapshot();
      });

      it(`${fixture.name} (${locale}): every sentence has result ids from this report behind it`, () => {
        const ids = new Set(report.results.map((item) => item.assessment_id));
        expect(summary.sentences.map((item) => item.key)).toEqual(["result", "problems", "start"]);
        for (const sentence of summary.sentences) {
          expect(sentence.assessment_ids.length).toBeGreaterThan(0);
          for (const id of sentence.assessment_ids) expect(ids.has(id)).toBe(true);
        }
      });

      it(`${fixture.name} (${locale}): the numbers are the metrics`, () => {
        const m = report.metrics;
        expect(summary.percent).toBe(Math.round(m.strict_pass_rate! * 100));
        expect(summary.pass).toBe(m.n_pass);
        expect(summary.scored).toBe(m.n_scorable);
        const [result, problems, start] = summary.sentences;
        expect(result.text.startsWith(`${m.n_pass} `)).toBe(true);
        expect(result.text).toContain(` ${m.n_scorable} `);
        expect(result.text).toContain(summary.percentText!);
        expect(result.assessment_ids).toHaveLength(m.n_pass + m.n_partial);
        expect(summary.sample).toContain(`${m.n_scorable}`);
        expect(summary.sample).toContain(`${m.n_eligible}`);
        // Problem counts recomputed from the results.
        const counts = new Map<string, number>();
        for (const item of report.results.filter(isFailing)) counts.set(problemOf(item), (counts.get(problemOf(item)) ?? 0) + 1);
        const top = [...counts].sort((a, b) => b[1] - a[1] || FIX_PROBLEMS.indexOf(a[0] as never) - FIX_PROBLEMS.indexOf(b[0] as never)).slice(0, 2);
        for (const [, count] of top) expect(problems.text).toContain(`(${count})`);
        expect(problems.assessment_ids).toHaveLength(top.reduce((sum, [, count]) => sum + count, 0));
        // "Start with" names the first fix and its size.
        expect(start.text).toContain(summary.fixes[0].title);
        expect(start.assessment_ids).toEqual(summary.fixes[0].assessment_ids);
      });

      it(`${fixture.name} (${locale}): three to five fixes, each from failed answers, causes labelled as hypotheses`, () => {
        const failing = new Set(report.results.filter(isFailing).map((item) => item.assessment_id));
        expect(summary.fixes.length).toBeGreaterThanOrEqual(3);
        expect(summary.fixes.length).toBeLessThanOrEqual(5);
        expect(summary.fixes.map((fix) => fix.rank)).toEqual(summary.fixes.map((_, index) => index + 1));
        for (const fix of summary.fixes) {
          expect(fix.assessment_ids.length).toBeGreaterThan(0);
          for (const id of fix.assessment_ids) expect(failing.has(id)).toBe(true);
          if (fix.cause) expect(fix.basis).toMatch(locale === "es" ? /hipótesis/ : /hypothesis/);
        }
        // No answer belongs to two fixes.
        const all = summary.fixes.flatMap((fix) => fix.assessment_ids);
        expect(new Set(all).size).toBe(all.length);
      });
    }
  }

  it("is the same object for a shared copy, from the metrics alone when the results stay private", () => {
    const report = fixtures[1].report;
    const shared = projectSharedReport(report, ["system", "scope", "metrics", "findings"]);
    const summary = buildExecutiveSummary(shared, "en")!;
    expect(summary.sentences.map((item) => item.key)).toEqual(["result"]);
    expect(summary.sentences[0].assessment_ids).toEqual([]);
    expect(summary.fixes).toEqual([]);
    expect(buildExecutiveSummary(projectSharedReport(report, ["findings"]), "en")).toBeNull();
  });

  it("says when nothing could be scored or nothing failed", () => {
    const report = fixtures[1].report;
    const unscored = buildExecutiveSummary({ ...report, metrics: { ...report.metrics, n_scorable: 0, n_pass: 0, n_partial: 0, n_fail: 0, strict_pass_rate: null }, results: report.results.map((item) => ({ ...item, outcome: "unscorable" as const })) }, "en")!;
    expect(unscored.sentences.map((item) => item.text)).toEqual(["No answer could be scored yet.", "Start with: check why the answers could not be scored (see Methodology), then run again."]);
    const passing = report.results.map((item) => ({ ...item, outcome: "pass" as const }));
    const perfect = buildExecutiveSummary({ ...report, metrics: { ...report.metrics, n_scorable: 6, n_pass: 6, n_partial: 0, n_fail: 0, strict_pass_rate: 1 }, results: passing }, "es")!;
    expect(perfect.sentences.map((item) => item.text)).toEqual([
      "6 de 6 respuestas coincidieron con tus fuentes (100 %).",
      "Ninguna de las respuestas puntuadas fue incorrecta ni incompleta.",
      "Empieza por: repite las mismas preguntas tras cada cambio para detectar regresiones.",
    ]);
    expect(perfect.fixes).toEqual([]);
  });
});

describe("summary wording", () => {
  const en = SUMMARY_COPY.en as Record<string, string>, es = SUMMARY_COPY.es as Record<string, string>;
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

  it("has every key in Spanish with the same placeholders", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(es[key].trim().length, key).toBeGreaterThan(0);
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("never claims certification, compliance or a verified cause", () => {
    for (const value of [...Object.values(en), ...Object.values(es)]) {
      expect(value).not.toMatch(/certif|complian|cumplimiento|guarantee|garantiza|root cause|causa raíz verificada|proves/i);
    }
  });

  it("recommends what the findings recommend", () => {
    for (const category of FIX_PROBLEMS) {
      expect(en[`action_${category}`]).toBe(FINDING_COPY[category].recommendation);
      expect(es[`action_${category}`]).toBe(localizeReportText(FINDING_COPY[category].recommendation, "es"));
    }
  });
});

describe("fix list exports", () => {
  const report = fixtures[2].report;
  const fixes = buildFixes(report.results, "en");

  it("writes one CSV row per answer and defuses spreadsheet formulas", () => {
    const hostile = report.results.map((item, index) => (index === 1 ? { ...item, input: "=HYPERLINK(\"https://x.test\")", output: "@SUM(A1)" } : item));
    const csv = fixesCsv(hostile, buildFixes(hostile, "en"));
    const rows = csv.trim().split("\r\n");
    expect(rows[0]).toBe("fix,fix_title,likely_cause_hypothesis,problem,source,severity,what_to_do,result,question,answer,expected_answer,why,assessment_id,case_revision_id");
    expect(csv).toContain(`"'=HYPERLINK(""https://x.test"")"`);
    expect(csv).toContain("'@SUM(A1)");
    expect(failingCsv(report.results).trim().split("\r\n")).toHaveLength(1 + report.results.filter(isFailing).length);
  });

  it("writes Markdown that shows recorded text as text", () => {
    const hostile = report.results.map((item, index) => (index === 1 ? { ...item, output: "<script>alert(1)</script> [click](https://x.test)" } : item));
    const markdown = fixesMarkdown({ system: report.system, results: hostile }, buildFixes(hostile, "en"), "en", "8 October 2026");
    expect(markdown).toContain("# Fix these first — Customer support assistant");
    expect(markdown).toContain("\\<script\\>alert(1)\\</script\\> \\[click\\](https://x.test)");
    expect(markdown).not.toContain("<script>");
    expect(markdown.match(/^## /gm)).toHaveLength(fixes.length);
  });

  it("refers to results compactly", () => {
    const number = new Map(["a", "b", "c", "d", "e", "f"].map((id, index) => [id, index + 1]));
    expect(testRefs(["a", "b", "c", "e", "f"], number)).toBe("T1–T3, T5, T6");
    expect(testRefs(["f", "a", "missing"], number)).toBe("T1, T6");
  });
});

describe("download names", () => {
  it("are Caudals-<system>-<date>.<ext>", () => {
    expect(reportDownloadName("0123456789", "application/pdf", "Asistente de inversión (producción)", "2026-10-08T10:00:00Z")).toBe("Caudals-Asistente-de-inversion-produccion-2026-10-08.pdf");
    expect(reportDownloadName("0123456789", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Support", new Date("2026-01-02T00:00:00Z"))).toBe("Caudals-Support-2026-01-02.docx");
    expect(reportDownloadName("0123456789", "text/markdown", "Support fixes", null)).toBe("Caudals-Support-fixes-01234567.md");
    expect(reportDownloadName("0123456789", "text/csv", null, "2026-10-08")).toBe("Caudals-report-2026-10-08.csv");
    expect(reportDownloadName("0123456789", "application/pdf", "\"/../evil\r\n", "x")).toBe("Caudals-evil-01234567.pdf");
  });
});
