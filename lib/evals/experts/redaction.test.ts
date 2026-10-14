/**
 * Redacted excerpts for expert review orders (launch L-26): experts see only
 * the material their task needs, without identifiers or personal data.
 */
import { describe, expect, it } from "vitest";
import { reportFixtures } from "@/scripts/evals/report-fixtures";
import { buildExpertExcerpts, orderEvidence, orderSeverity, redactForExpert } from "./redaction";
import { expertOnboardingInputSchema, missingOnboarding, reviewOrderInputSchema, reviewRequestInputSchema, slaState } from "./review-contracts";

describe("redactForExpert", () => {
  it("removes contact details, links, account and identity numbers", () => {
    const text = [
      "Write to ana.garcia@hogarel.es or call +34 912 345 678 or 612 345 678.",
      "See https://www.hogarel.es/tarifas?ref=chat and hogarel.com/ayuda and www.example.org.",
      "IBAN ES91 2100 0418 4502 0005 1332, card 4111 1111 1111 1111.",
      "DNI 12345678Z, NIE X1234567L, CIF B12345674.",
    ].join(" ");
    const out = redactForExpert(text);
    for (const leaked of ["ana.garcia", "hogarel", "912 345 678", "612 345 678", "ES91", "4111", "12345678Z", "X1234567L", "B12345674", "example.org"]) {
      expect(out.toLowerCase()).not.toContain(leaked.toLowerCase());
    }
    expect(out).toContain("[email]");
    expect(out).toContain("[link]");
    expect(out).toContain("[website]");
    expect(out).toContain("[phone]");
    expect(out).toContain("[iban]");
    expect(out).toContain("[number]");
    expect(out).toContain("[id]");
  });

  it("keeps dates, times, amounts and ordinary numbers", () => {
    const text = "Claims filed on 2026-10-13 12:00 within 30 days cost 1.500,00 € (or 1,500.00 EUR), 25% off, policy 7 of 12.";
    expect(redactForExpert(text)).toBe(text);
  });

  it("removes the workspace, system and report names and the distinctive first word", () => {
    const out = redactForExpert("Hogarel Seguros covers it. Ask the Hogar Completo assistant; HOGAREL agents reply.", ["Hogarel Seguros", "Hogar Completo"]);
    expect(out).not.toMatch(/hogarel|hogar completo/i);
    expect(out).toContain("[company]");
    // Short or common words are not names to remove.
    expect(redactForExpert("The policy covers water damage.", ["AB"])).toBe("The policy covers water damage.");
  });
});

describe("order excerpts", () => {
  const [fixture] = reportFixtures();
  const report = fixture.report;
  const failing = report.results.filter((item) => item.outcome === "fail" || item.outcome === "partial");
  const ids = failing.slice(0, 5).map((item) => item.assessment_id);

  it("carries only the chosen results, in report order, with unique anchors and no identifiers", () => {
    const excerpts = buildExpertExcerpts(report, ids, { locale: "en", names: ["Hogarel", report.system.name] });
    expect(excerpts).toHaveLength(ids.length);
    expect(new Set(excerpts.map((item) => item.anchor)).size).toBe(excerpts.length);
    expect(excerpts.map((item) => item.anchor.split(" ")[0])).toEqual(ids.map((_, index) => `Q${index + 1}`));
    const text = JSON.stringify(excerpts);
    for (const item of report.results) {
      expect(text).not.toContain(item.assessment_id);
      expect(text).not.toContain(item.observation_id);
      expect(text).not.toContain(item.case_revision_id);
      for (const ref of item.source_refs) expect(text).not.toContain(ref.source_revision_id);
    }
    expect(text).not.toMatch(/hogarel/i);
    expect(excerpts[0].text).toMatch(/^Question: /);
    expect(excerpts[0].text).toContain("Automatic grade: ");
  });

  it("is written in the request's language and validates as Stage E evidence", () => {
    const excerpts = buildExpertExcerpts(report, ids, { locale: "es", names: [] });
    expect(excerpts[0].text).toMatch(/^Pregunta: /);
    expect(excerpts[0].text).toContain("Calificación automática: ");
    const evidence = orderEvidence(excerpts);
    expect(evidence.transcript).toEqual([]);
    expect(evidence.excerpts.every((item) => !("source_revision_id" in item))).toBe(true);
    expect(() => orderEvidence([])).toThrow();
  });

  it("takes the highest severity of the chosen results", () => {
    const ranks = ["low", "medium", "high", "critical"];
    const expected = failing.slice(0, 5).reduce((top, item) => (ranks.indexOf(item.severity) > ranks.indexOf(top) ? item.severity : top), "low");
    expect(orderSeverity(report, ids)).toBe(expected);
    expect(orderSeverity(report, [])).toBe("low");
  });
});

describe("request and order contracts", () => {
  const orgId = "00000000-0000-4000-8000-000000000001";
  it("accepts the short form and refuses unknown scopes, sectors and fields", () => {
    expect(reviewRequestInputSchema.parse({ orgId, surface: "report", scopeKind: "failed_answers", sector: "insurance", locale: "es", deadline: "2026-11-02", scopeNote: "Fees" })).toMatchObject({ sector: "insurance" });
    expect(() => reviewRequestInputSchema.parse({ orgId, surface: "report", scopeKind: "everything", sector: "insurance", locale: "en" })).toThrow();
    expect(() => reviewRequestInputSchema.parse({ orgId, surface: "report", scopeKind: "pilot", sector: "space", locale: "en" })).toThrow();
    expect(() => reviewRequestInputSchema.parse({ orgId, surface: "report", scopeKind: "pilot", sector: "other", locale: "en", price: 1 })).toThrow();
  });

  it("orders need a hand-written quote in euros, distinct experts and a conflict confirmation", () => {
    const order = {
      orgId, scope: "The failed answers on fees", sector: "insurance", dueAt: "2026-11-02T17:00:00.000Z", quoteAmount: "1500.00", quoteCurrency: "EUR",
      quoteNote: "Two experts, 12 answers, invoice on delivery.", expertProfileIds: ["00000000-0000-4000-8000-000000000002"], resultIds: ["a1"], conflictsCleared: true,
    };
    expect(reviewOrderInputSchema.parse(order)).toMatchObject({ quoteAmount: "1500.00" });
    expect(() => reviewOrderInputSchema.parse({ ...order, quoteCurrency: "USD" })).toThrow();
    expect(() => reviewOrderInputSchema.parse({ ...order, credits: 100 })).toThrow();
    expect(() => reviewOrderInputSchema.parse({ ...order, conflictsCleared: false })).toThrow();
    expect(() => reviewOrderInputSchema.parse({ ...order, expertProfileIds: [order.expertProfileIds[0], order.expertProfileIds[0]] })).toThrow();
  });

  it("names what an expert still needs before order work", () => {
    expect(missingOnboarding(null)).toEqual(["credentials", "contract", "ip_assignment", "confidentiality", "dpa", "trial", "availability"]);
    const done = expertOnboardingInputSchema.parse({
      credentials_verified_at: "2026-10-01T12:00:00.000Z", contract_signed_at: "2026-10-02T12:00:00.000Z", ip_assignment: true, confidentiality: true,
      dpa_signed_at: "2026-10-02T12:00:00.000Z", trial_gold_items: 20, trial_agreement: 0.85, agreement_threshold: 0.8, trial_completed_at: "2026-10-05T12:00:00.000Z",
      trial_paid_at: null, sectors: ["insurance"], availability: "limited", hours_per_week: 6, notes: null,
    });
    expect(missingOnboarding(done)).toEqual([]);
    expect(missingOnboarding({ ...done, trial_agreement: 0.7 })).toEqual(["agreement"]);
    expect(missingOnboarding({ ...done, ip_assignment: false, availability: "unavailable" })).toEqual(["ip_assignment", "availability"]);
    expect(() => expertOnboardingInputSchema.parse({ ...done, trial_agreement: null })).toThrow();
  });

  it("tracks SLAs", () => {
    const now = Date.parse("2026-10-13T10:00:00Z");
    expect(slaState("2026-10-13T09:00:00Z", false, now)).toBe("overdue");
    expect(slaState("2026-10-13T20:00:00Z", false, now)).toBe("due_soon");
    expect(slaState("2026-10-16T10:00:00Z", false, now)).toBe("on_time");
    expect(slaState("2026-10-13T09:00:00Z", true, now)).toBe("done");
    expect(slaState(null, false, now)).toBe("none");
  });
});
