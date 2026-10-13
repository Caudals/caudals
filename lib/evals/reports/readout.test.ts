/**
 * Readout mode (launch L-35, spec P-57): from a report snapshot to slides.
 * The deck for each fixture is snapshotted, then the guarantees behind it:
 * every number is the report's number (metrics, executive summary, "Why
 * answers failed", "Likely causes", "Fix these first", the report's T
 * numbers), transcripts default to the most severe failure for each cause,
 * causes stay labelled as hypotheses, notes never enter a deck or a slide,
 * and the EN/ES wording is complete and claim-free.
 */
import { describe, expect, it } from "vitest";
import { reportFixtures } from "@/scripts/evals/report-fixtures";
import { readoutAccess } from "../readout/access";
import { readoutMode } from "../readout/flags";
import type { ReportSnapshot } from "./contracts";
import { causeOf, isFailing } from "./fixes";
import { reportStrings } from "./i18n";
import { renderReportHtml } from "./render";
import {
  READOUT_MAX_TRANSCRIPTS,
  READOUT_MIN_TRANSCRIPTS,
  buildReadoutDeck,
  clip,
  defaultNextStep,
  defaultNote,
  defaultTranscriptIds,
  resolveTranscriptIds,
  slideSegment,
  type ReadoutSlide,
} from "./readout";
import { READOUT_COPY } from "./readout-copy";
import { renderReadoutSlide } from "./readout-document";
import { readoutExportPath, renderReadoutHtml } from "./readout-pdf";
import { buildExecutiveSummary } from "./summary";
import { wholePercent } from "./summary-copy";

const fixtures = reportFixtures();
const SEVERITY = ["critical", "high", "medium", "low"];
const unescape = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const textOf = (html: string) => unescape(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
type Of<K extends ReadoutSlide["kind"]> = Extract<ReadoutSlide, { kind: K }>;
const only = <K extends ReadoutSlide["kind"]>(slides: ReadoutSlide[], kind: K) => slides.filter((slide): slide is Of<K> => slide.kind === kind);

/** The report PDF's T numbers by result id, read from its evidence appendix. */
function reportNumbers(report: ReportSnapshot, locale: "en" | "es") {
  const html = renderReportHtml(report, locale);
  const label = reportStrings(locale).assessmentId;
  const numbers = new Map<string, number>();
  for (const match of html.matchAll(/<article class="evidence">\s*<header><span class="index">T(\d+)<\/span>[\s\S]*?<p class="ids">([\s\S]*?)<\/p>/g)) {
    const id = new RegExp(`${label} ([^ <]+)$`).exec(unescape(match[2]).trim())?.[1];
    if (id) numbers.set(id, Number(match[1]));
  }
  return numbers;
}
/** The report's own counts: "Why answers failed" and "Likely causes" (components/evals/result-labels.tsx). */
function reportCounts(report: ReportSnapshot) {
  const categories = ["no_answer", "wrong_information", "missing_information", "contradicts_source", "off_topic"];
  const problems = new Map<string, number>(), causes = new Map<string, number>();
  for (const result of report.results.filter(isFailing)) {
    const category = result.failure_category && categories.includes(result.failure_category) ? result.failure_category : result.outcome === "partial" ? "missing_information" : "other";
    problems.set(category, (problems.get(category) ?? 0) + 1);
    if (causeOf(result)) causes.set(result.likely_cause!, (causes.get(result.likely_cause!) ?? 0) + 1);
  }
  return { problems, causes };
}

describe("readout deck from a report snapshot", () => {
  for (const fixture of fixtures) {
    for (const locale of ["en", "es"] as const) {
      const report = fixture.report;
      const deck = buildReadoutDeck(report, locale, { sample: fixture.sample });
      const html = deck.slides.map((_, index) => renderReadoutSlide(deck, index));

      it(`${fixture.name} (${locale}) matches its snapshot`, () => {
        expect(deck.slides.map((slide, index) => ({ key: slide.key, text: textOf(html[index]) }))).toMatchSnapshot();
      });

      it(`${fixture.name} (${locale}): cover, verdict, causes, transcripts, fixes, next step`, () => {
        const kinds = deck.slides.map((slide) => slide.kind);
        const transcripts = kinds.filter((kind) => kind === "transcript").length;
        expect(kinds).toEqual(["cover", "verdict", "causes", ...Array(transcripts).fill("transcript"), "fixes", "next"]);
        expect(transcripts).toBeGreaterThanOrEqual(Math.min(READOUT_MIN_TRANSCRIPTS, report.results.filter((item) => item.outcome !== "unscorable").length));
        expect(transcripts).toBeLessThanOrEqual(READOUT_MAX_TRANSCRIPTS);
        html.forEach((slide, index) => expect(slide).toContain(`${index + 1} / ${deck.slides.length}`));
        if (fixture.sample) html.forEach((slide) => expect(slide).toContain(READOUT_COPY[locale].sampleLabel));
      });

      it(`${fixture.name} (${locale}): the verdict is the executive summary and its numbers are the metrics`, () => {
        const summary = buildExecutiveSummary(report, locale, { sample: fixture.sample })!;
        const [verdict] = only(deck.slides, "verdict");
        expect(verdict.percentText).toBe(wholePercent(report.metrics.strict_pass_rate!, locale));
        expect(verdict.percentText).toBe(summary.percentText);
        expect([verdict.pass, verdict.scored]).toEqual([report.metrics.n_pass, report.metrics.n_scorable]);
        expect(verdict.sentences.map((item) => item.text)).toEqual(summary.sentences.map((item) => item.text));
        expect(verdict.sample).toBe(summary.sample);
        const text = textOf(html[1]);
        expect(text).toContain(summary.percentText!);
        for (const sentence of summary.sentences) expect(text).toContain(sentence.text);
        expect(text).toContain(`${report.metrics.n_pass} / ${report.metrics.n_scorable}`);
        const [cover] = only(deck.slides, "cover");
        expect(cover.status.map((item) => item.label)).toEqual(summary.status.map((item) => item.label));
        expect(cover.scope).toContain(String(report.metrics.n_eligible));
      });

      it(`${fixture.name} (${locale}): causes are the report's counts and are labelled hypotheses`, () => {
        const [causes] = only(deck.slides, "causes");
        const expected = reportCounts(report);
        expect(Object.fromEntries(causes.problems.map((row) => [row.key, row.count]))).toEqual(Object.fromEntries(expected.problems));
        expect(Object.fromEntries(causes.causes.map((row) => [row.key, row.count]))).toEqual(Object.fromEntries(expected.causes));
        expect(causes.problems.reduce((sum, row) => sum + row.count, 0)).toBe(report.results.filter(isFailing).length);
        expect(causes.scored).toBe(report.metrics.n_scorable);
        const text = textOf(html[2]);
        expect(text).toContain(READOUT_COPY[locale].likelyCauses);
        expect(text).toContain(READOUT_COPY[locale].causesHypothesis);
      });

      it(`${fixture.name} (${locale}): transcripts carry the report's result numbers, ids and source excerpts`, () => {
        const numbers = reportNumbers(report, locale);
        const byId = new Map(report.results.map((item) => [item.assessment_id, item]));
        const transcripts = only(deck.slides, "transcript");
        expect(transcripts.map((slide) => slide.assessment_id)).toEqual(deck.transcriptIds);
        transcripts.forEach((slide, position) => {
          const result = byId.get(slide.assessment_id)!;
          expect(slide.number).toBe(numbers.get(slide.assessment_id));
          const text = textOf(html[3 + position]);
          expect(text).toContain(`T${slide.number}`);
          expect(text).toContain(slide.assessment_id);
          const excerpt = result.source_excerpts?.find((item) => item.excerpt.trim());
          if (excerpt) expect(clip(excerpt.excerpt, 1e6).text.startsWith(slide.excerpt!.text.text.replace(/…$/, ""))).toBe(true);
          if (causeOf(result)) expect(slide.cause).toMatch(locale === "es" ? /hipótesis/ : /hypothesis/);
        });
      });

      it(`${fixture.name} (${locale}): the fixes are "Fix these first"`, () => {
        const summary = buildExecutiveSummary(report, locale, { sample: fixture.sample })!;
        const [fixes] = only(deck.slides, "fixes");
        expect(fixes.fixes.map((fix) => [fix.rank, fix.assessment_ids, fix.critical, fix.basis])).toEqual(summary.fixes.map((fix) => [fix.rank, fix.assessment_ids, fix.critical, fix.basis]));
        fixes.fixes.forEach((fix, index) => expect(summary.fixes[index].title.startsWith(fix.title.text.replace(/…$/, ""))).toBe(true));
      });
    }
  }
});

describe("transcript picks", () => {
  const report = fixtures[0].report;
  it("default to the most severe failure for each cause, then fill to five with failures, then passes", () => {
    for (const fixture of fixtures) {
      const results = fixture.report.results;
      const ids = defaultTranscriptIds(results);
      const byId = new Map(results.map((item) => [item.assessment_id, item]));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeLessThanOrEqual(READOUT_MAX_TRANSCRIPTS);
      for (const id of ids) expect(byId.get(id)!.outcome).not.toBe("unscorable");
      const key = (item: (typeof results)[number]) => causeOf(item) ?? `p:${item.failure_category ?? item.outcome}`;
      const failing = results.filter(isFailing);
      // The first pick of each cause group is that group's most severe failure.
      const seen = new Set<string>();
      for (const id of ids) {
        const item = byId.get(id)!;
        if (!isFailing(item) || seen.has(key(item))) continue;
        seen.add(key(item));
        const worst = Math.min(...failing.filter((other) => key(other) === key(item)).map((other) => SEVERITY.indexOf(other.severity)));
        expect(SEVERITY.indexOf(item.severity)).toBe(worst);
      }
      if (failing.length >= READOUT_MIN_TRANSCRIPTS) expect(ids.every((id) => isFailing(byId.get(id)!))).toBe(true);
    }
  });
  it("keep only this snapshot's results, without duplicates, and fall back to the default", () => {
    const [a, b] = report.results.map((item) => item.assessment_id);
    expect(resolveTranscriptIds(report.results, [b, a, b, "not-in-this-report"])).toEqual([b, a]);
    expect(resolveTranscriptIds(report.results, ["not-in-this-report"])).toEqual(defaultTranscriptIds(report.results));
    expect(resolveTranscriptIds(report.results, null)).toEqual(defaultTranscriptIds(report.results));
    const deck = buildReadoutDeck(report, "en", { transcriptIds: [b, a] });
    expect(deck.slides.filter((slide) => slide.kind === "transcript").map((slide) => (slide as Of<"transcript">).assessment_id)).toEqual([b, a]);
  });
});

describe("next step", () => {
  it("is preselected from the plan and can be changed", () => {
    expect(defaultNextStep("managed")).toBe("subscription");
    for (const plan of ["free", "payg", "partner", null, undefined]) expect(defaultNextStep(plan)).toBe("pilot");
    const report = fixtures[1].report;
    expect(buildReadoutDeck(report, "es", { plan: "managed" }).nextStep).toBe("subscription");
    const deck = buildReadoutDeck(report, "es", { plan: "managed", nextStep: "pilot" });
    expect(textOf(renderReadoutSlide(deck, deck.slides.length - 1))).toContain(READOUT_COPY.es.next_pilot_title);
  });
});

describe("presenter notes stay out of decks and documents", () => {
  it("never reach a deck, a slide or the PDF document", () => {
    for (const fixture of fixtures) {
      for (const locale of ["en", "es"] as const) {
        const deck = buildReadoutDeck(fixture.report, locale, { sample: fixture.sample });
        const document = renderReadoutHtml(deck) + JSON.stringify(deck);
        for (const slide of deck.slides) expect(document).not.toContain(defaultNote(slide, locale).slice(0, 40));
      }
    }
  });
  it("map every slide to the §7.5 script", () => {
    const deck = buildReadoutDeck(fixtures[0].report, "en");
    expect(deck.slides.map((slide) => slideSegment(slide).key)).toEqual(deck.slides.map((slide) => (slide.kind === "cover" || slide.kind === "verdict" ? "context" : slide.kind === "causes" || slide.kind === "transcript" ? "failures" : slide.kind === "fixes" ? "fixes" : "next")));
    expect(slideSegment({ kind: "next" })).toMatchObject({ from: 15, to: 20 });
  });
});

describe("readout copy", () => {
  it("has the same keys and placeholders in English and Spanish", () => {
    expect(Object.keys(READOUT_COPY.es).sort()).toEqual(Object.keys(READOUT_COPY.en).sort());
    for (const key of Object.keys(READOUT_COPY.en) as Array<keyof typeof READOUT_COPY.en>) {
      const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(placeholders(READOUT_COPY.es[key]), key).toEqual(placeholders(READOUT_COPY.en[key]));
      expect(READOUT_COPY.es[key].trim(), key).not.toBe("");
    }
  });
  it("makes no certification or compliance claim and quotes no price", () => {
    for (const table of [READOUT_COPY.en, READOUT_COPY.es]) {
      for (const value of Object.values(table)) {
        expect(value).not.toMatch(/\bcertif(?:ied|ies|y|icad)|\bcompliant\b|\bcumple\b|conformidad|€|\bEUR\b/i);
      }
    }
    expect(READOUT_COPY.en.footer).toContain("not a certification");
  });
});

describe("readout access and flag", () => {
  it("opens to operators first, then owners and editors, never viewers", () => {
    expect(readoutAccess("off", "operator", true)).toEqual({ present: false, notes: false, edit: false });
    expect(readoutAccess("operators", "owner", false)).toEqual({ present: false, notes: false, edit: false });
    expect(readoutAccess("operators", "operator", false)).toEqual({ present: true, notes: true, edit: true });
    expect(readoutAccess("operators", null, true)).toEqual({ present: true, notes: true, edit: true });
    expect(readoutAccess("all", "owner", false)).toEqual({ present: true, notes: false, edit: false });
    expect(readoutAccess("all", "editor", false)).toEqual({ present: true, notes: false, edit: false });
    expect(readoutAccess("all", "viewer", false)).toEqual({ present: false, notes: false, edit: false });
  });
  it("reads READOUT_MODE_ENABLED, default off", () => {
    expect(readoutMode({})).toBe("off");
    expect(readoutMode({ READOUT_MODE_ENABLED: "operators" })).toBe("operators");
    expect(readoutMode({ READOUT_MODE_ENABLED: "true" })).toBe("all");
    expect(readoutMode({ READOUT_MODE_ENABLED: "yes" })).toBe("off");
  });
});

describe("readout PDF path", () => {
  it("differs by deck and language and carries the layout version", () => {
    const deck = { transcript_ids: ["a", "b"], next_step: "pilot" as const };
    const path = readoutExportPath("rev", "en", deck);
    expect(path).toMatch(/^readouts\/rev\.[0-9a-f]{12}\.v1\.pdf$/);
    expect(readoutExportPath("rev", "es", deck)).toMatch(/^readouts\/rev\.es\./);
    expect(readoutExportPath("rev", "en", { ...deck, next_step: "subscription" })).not.toBe(path);
  });
});
