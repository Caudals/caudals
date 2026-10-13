import { describe, expect, it } from "vitest";
import { wilson } from "@/lib/evals/scoring/aggregate";
import { localizePathname } from "@/lib/i18n/routing";
import { getIndexableMarketingRoutes } from "@/lib/seo";
import { METHODOLOGY_PATH, METHODOLOGY_UPDATED, methodologyCopy, renderMethodologyMarkdown, type MethodologyCopy } from "./content";

const en = methodologyCopy("en"), es = methodologyCopy("es");

/** Every string in the copy, with its path. */
function strings(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
  return [];
}
/** The copy's structure: keys, list lengths and non-text values, without the words. */
function shape(value: unknown): unknown {
  if (typeof value === "string") return "s";
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "verdict" || key === "id" ? item : shape(item)]));
  return value;
}
const section = (copy: MethodologyCopy, id: string) => copy.sections.find((item) => item.id === id)!;

describe("methodology page content", () => {
  it("has the same structure, anchors and labels in English and Spanish", () => {
    expect(shape(es)).toEqual(shape(en));
    expect(en.sections.map((item) => item.id)).toEqual(["questions", "grading", "labels", "samples", "review", "traceability", "limits", "never"]);
    for (const [path, text] of [...strings(en), ...strings(es)]) expect(text.trim(), path).not.toBe("");
    expect(en.updated).toContain("{date}");
    expect(es.updated).toContain("{date}");
  });

  it("covers what the spec asks for: sources, grading by meaning, labels, samples and intervals, review, limits, never", () => {
    const all = JSON.stringify(en);
    for (const phrase of ["your own material", "not on how it is worded", "Outcome labels", "95% interval", "Review levels", "Limits", "written authorisation", "do not certify"]) expect(all).toContain(phrase);
    const spanish = JSON.stringify(es);
    for (const phrase of ["tu propio material", "no por cómo está redactada", "Etiquetas de resultado", "intervalo del 95 %", "Niveles de revisión", "Límites", "autorización por escrito", "No certificamos"]) expect(spanish).toContain(phrase);
  });

  it("lists the seven outcome labels of grading engine v2, four of them scored", () => {
    for (const copy of [en, es]) {
      const rows = section(copy, "labels").labels!.rows;
      expect(rows.map((row) => [row.verdict, row.scored])).toEqual([
        ["correct", true], ["partial", true], ["incorrect", true], ["no_answer", true],
        ["unscored", false], ["unscored", false], ["unscored", false],
      ]);
    }
  });

  it("prints intervals that the scorer actually computes (Wilson, 95%)", () => {
    for (const copy of [en, es]) {
      for (const row of section(copy, "samples").table!.rows) {
        const [scored, correct, rate, interval] = row.map((value) => value.match(/\d+/g)!.map(Number));
        const bounds = wilson(correct[0], scored[0])!;
        expect(rate[0], row.join(" | ")).toBe(Math.round((100 * correct[0]) / scored[0]));
        expect(interval, row.join(" | ")).toEqual([Math.round(bounds.low * 100), Math.round(bounds.high * 100)]);
      }
    }
  });

  it("never claims certification or compliance, only denies it", () => {
    for (const [path, text] of [...strings(en), ...strings(es)]) {
      if (/certif|complian|cumpl|conformidad/i.test(text)) expect(text, path).toMatch(/\b(not|never|no|nunca)\b/i);
    }
  });

  it("is a public page in the sitemap, translated in Spanish, with agent markdown", () => {
    expect(localizePathname(METHODOLOGY_PATH, "en")).toBe("/en/methodology");
    expect(localizePathname(METHODOLOGY_PATH, "es")).toBe("/es/metodologia");
    expect(getIndexableMarketingRoutes()).toContainEqual(expect.objectContaining({ pathname: METHODOLOGY_PATH, lastModified: METHODOLOGY_UPDATED }));
    for (const locale of ["en", "es"] as const) {
      const markdown = renderMethodologyMarkdown(locale);
      expect(markdown.title).not.toContain("*");
      for (const item of methodologyCopy(locale).sections) expect(markdown.body).toContain(item.title);
      expect(markdown.body).toContain("| --- |");
    }
  });
});
