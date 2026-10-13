import { describe, expect, it } from "vitest";
import { getTranslator } from "@/lib/i18n/server";
import { EVALUATION_OFFERS, renderEvaluationOverviewMarkdown } from "./evaluation-offers";

// Launch L-20 (with L-04, L-05, L-30): agents read the offers the site leads
// with — the free test, the free account, credits in the app, quoted work —
// and the manual diagnostic only as the option for teams who prefer it.
describe("public offers for agents", () => {
  it("lead with the free test and keep the manual diagnostic last", () => {
    expect(EVALUATION_OFFERS.map((offer) => offer.id)).toEqual(["freeTest", "freeAccount", "payAsYouGo", "pilotEvaluation", "monthlySubscription", "realityCheck"]);
    expect(EVALUATION_OFFERS.find((offer) => offer.id === "freeTest")?.start).toEqual({ kind: "public", path: "/demo" });
    expect(EVALUATION_OFFERS.find((offer) => offer.id === "realityCheck")?.start).toEqual({ kind: "contact", slug: "reality-check" });
  });

  for (const [locale, names] of [
    ["en", ["Free test", "Free account", "Pay as you go", "Pilot Evaluation", "Monthly subscription", "Initial Diagnostic"]],
    ["es", ["Prueba gratuita", "Cuenta gratuita", "Pago por uso", "Evaluación piloto", "Suscripción mensual", "Diagnóstico inicial"]],
  ] as const) {
    it(`render in that order in ${locale}, without prices beyond "free"`, () => {
      const markdown = renderEvaluationOverviewMarkdown(getTranslator(locale));
      const positions = names.map((name) => markdown.indexOf(`**${name}**`));
      expect(positions.every((position) => position >= 0), markdown).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      expect(markdown).not.toMatch(/€|\bEUR\b|\d+\s*(credits|créditos)/i);
      expect(markdown).toMatch(locale === "en" ? /8|[Ee]ight questions/ : /[Oo]cho preguntas/);
    });
  }
});
