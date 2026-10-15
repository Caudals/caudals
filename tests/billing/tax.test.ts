/**
 * IVA treatment for top-ups (spec §6.14, D-05): every customer case, tax ID
 * validation and the VIES client with its retries.
 */
import { describe, expect, it } from "vitest";
import {
  checkTaxId, checkVies, decideTaxTreatment, grossCents, isSpanishSpecialTerritory, isValidSpanishNif, taxMention, vatCents, vatRateBp,
} from "../../lib/billing/tax";
import { PACKS } from "../../lib/billing/packs";
import { REVIEW_TREATMENTS, reviewTreatmentAllowed } from "../../lib/billing/tax-review";

describe("Spanish NIF", () => {
  it("accepts company CIFs, DNIs, NIEs and K/L/M NIFs with the right control character", () => {
    for (const id of ["B12345674", "P1234567D", "Q1234567D", "A12345674", "12345678Z", "X1234567L", "Y1234567X", "esb12345674", "B-1234567-4"]) {
      expect(isValidSpanishNif(id), id).toBe(true);
    }
  });
  it("rejects a wrong control character or shape", () => {
    for (const id of ["B12345675", "P12345674", "12345678A", "X1234567A", "B1234567", "Z", ""]) expect(isValidSpanishNif(id), id).toBe(false);
  });
});

describe("tax IDs by country", () => {
  it("Spain takes a NIF, dropping an ES prefix", () => {
    expect(checkTaxId("ES", "ESB12345674")).toEqual({ ok: true, kind: "es_nif", taxId: "B12345674" });
    expect(checkTaxId("ES", "B12345675")).toEqual({ ok: false, error: "TAX_ID_INVALID" });
  });
  it("other EU countries take a VAT ID with its prefix (Greece: EL), checked in VIES", () => {
    expect(checkTaxId("FR", "FR 12 345678901")).toMatchObject({ ok: true, kind: "eu_vat", taxId: "FR12345678901", viesCountry: "FR", viesNumber: "12345678901" });
    expect(checkTaxId("IE", "6388047V")).toMatchObject({ ok: true, kind: "eu_vat", taxId: "IE6388047V", viesCountry: "IE" });
    expect(checkTaxId("GR", "123456789")).toMatchObject({ ok: true, kind: "eu_vat", taxId: "EL123456789", viesCountry: "EL" });
    expect(checkTaxId("DE", "DE!")).toEqual({ ok: false, error: "TAX_ID_INVALID" });
  });
  it("outside the EU, a company or tax registration number", () => {
    expect(checkTaxId("US", "EIN 12-3456789")).toEqual({ ok: true, kind: "non_eu_business", taxId: "EIN123456789" });
    expect(checkTaxId("GB", "GB123456789")).toEqual({ ok: true, kind: "non_eu_business", taxId: "GB123456789" });
    expect(checkTaxId("US", "x")).toEqual({ ok: false, error: "TAX_ID_INVALID" });
    expect(checkTaxId("usa", "123456")).toEqual({ ok: false, error: "COUNTRY_INVALID" });
  });
});

describe("IVA treatment (§6.14)", () => {
  it("Spain (NIF): 21 % IVA", () => {
    expect(decideTaxTreatment({ country: "ES", kind: "es_nif", vies: "not_required", postalCode: "47001" })).toEqual({ treatment: "es_vat", reviewReason: null });
  });
  it("EU business with a valid VIES number: reverse charge, mention 'Inversión del sujeto pasivo'", () => {
    const decision = decideTaxTreatment({ country: "FR", kind: "eu_vat", vies: "valid", postalCode: "75001" });
    expect(decision).toEqual({ treatment: "eu_reverse_charge", reviewReason: null });
    expect(taxMention("eu_reverse_charge")).toBe("Inversión del sujeto pasivo");
  });
  it("EU business without a valid VIES number pays Spanish IVA", () => {
    expect(decideTaxTreatment({ country: "DE", kind: "eu_vat", vies: "invalid", postalCode: "10115" })).toEqual({ treatment: "es_vat", reviewReason: null });
  });
  it("VIES unavailable after retries: manual review, no treatment", () => {
    expect(decideTaxTreatment({ country: "IT", kind: "eu_vat", vies: "unavailable", postalCode: "00100" })).toEqual({ treatment: null, reviewReason: "vies_unavailable" });
  });
  it("business outside the EU: 'Operación no sujeta'", () => {
    expect(decideTaxTreatment({ country: "US", kind: "non_eu_business", vies: "not_required", postalCode: "94105" })).toEqual({ treatment: "non_eu_not_subject", reviewReason: null });
    expect(taxMention("non_eu_not_subject")).toBe("Operación no sujeta");
    expect(taxMention("es_vat")).toBeNull();
  });
  it("Canary Islands, Ceuta and Melilla go to manual review", () => {
    for (const code of ["35001", "38001", "51001", "52001"]) {
      expect(isSpanishSpecialTerritory(code)).toBe(true);
      expect(decideTaxTreatment({ country: "ES", kind: "es_nif", vies: "not_required", postalCode: code }).treatment).toBeNull();
    }
    expect(isSpanishSpecialTerritory("28001")).toBe(false);
  });
  it("VAT is exact for every pack: 21 % on the net price, none otherwise", () => {
    expect(PACKS.map(pack => [pack.netCents, vatCents(pack.netCents, "es_vat"), grossCents(pack.netCents, "es_vat")])).toEqual([
      [2000, 420, 2420], [5000, 1050, 6050], [10000, 2100, 12100], [25000, 5250, 30250], [50000, 10500, 60500],
    ]);
    for (const treatment of ["eu_reverse_charge", "non_eu_not_subject"] as const) {
      expect(vatRateBp(treatment)).toBe(0);
      expect(grossCents(5000, treatment)).toBe(5000);
    }
  });
});

describe("VIES client", () => {
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fast = { delaysMs: [0, 0] };

  it("valid and invalid numbers", async () => {
    await expect(checkVies("IE", "6388047V", { ...fast, fetch: async () => response({ valid: true, requestIdentifier: "WAPIAAAA" }) }))
      .resolves.toMatchObject({ status: "valid", consultation: "WAPIAAAA" });
    await expect(checkVies("IE", "1234567X", { ...fast, fetch: async () => response({ valid: false, requestIdentifier: "" }) }))
      .resolves.toMatchObject({ status: "invalid", consultation: null });
    await expect(checkVies("XX", "1", { ...fast, fetch: async () => response({ actionSucceed: false, errorWrappers: [{ error: "INVALID_INPUT" }] }) }))
      .resolves.toMatchObject({ status: "invalid" });
  });
  it("retries outages, then answers when VIES recovers", async () => {
    const answers = [response({ actionSucceed: false, errorWrappers: [{ error: "MS_UNAVAILABLE" }] }), response({}, 503), response({ valid: true })];
    let calls = 0;
    await expect(checkVies("FR", "12345678901", { ...fast, fetch: async () => answers[calls++] })).resolves.toMatchObject({ status: "valid" });
    expect(calls).toBe(3);
  });
  it("stays unavailable (manual review) after every attempt fails", async () => {
    let calls = 0;
    const result = await checkVies("DE", "123456789", { ...fast, fetch: async () => { calls++; throw new Error("network"); } });
    expect(result.status).toBe("unavailable");
    expect(calls).toBe(3);
  });
});

describe("manual tax review choices (G2, §6.14)", () => {
  it("allows 'not subject' or 21 % IVA for the Canary Islands, Ceuta and Melilla, never a reverse charge", () => {
    expect(REVIEW_TREATMENTS.es_special_territory).toEqual(["non_eu_not_subject", "es_vat"]);
    expect(reviewTreatmentAllowed("es_special_territory", "non_eu_not_subject", null)).toBe(true);
    expect(reviewTreatmentAllowed("es_special_territory", "es_vat", null)).toBe(true);
    expect(reviewTreatmentAllowed("es_special_territory", "eu_reverse_charge", "WAPIAAAAZ1")).toBe(false);
    expect(reviewTreatmentAllowed("es_special_territory", "non_eu_not_subject", "WAPIAAAAZ1")).toBe(false);
    for (const postalCode of ["35001", "38003", "51001", "52001"]) expect(isSpanishSpecialTerritory(postalCode)).toBe(true);
    expect(taxMention("non_eu_not_subject")).toBe("Operación no sujeta");
    expect(vatCents(5000, "non_eu_not_subject")).toBe(0);
  });
  it("allows a reverse charge for an EU VAT number only with the VIES consultation number, else 21 % IVA; never 'not subject'", () => {
    expect(reviewTreatmentAllowed("vies_unavailable", "eu_reverse_charge", "WAPIAAAAZ1")).toBe(true);
    expect(reviewTreatmentAllowed("vies_unavailable", "eu_reverse_charge", null)).toBe(false);
    expect(reviewTreatmentAllowed("vies_unavailable", "eu_reverse_charge", "  ")).toBe(false);
    expect(reviewTreatmentAllowed("vies_unavailable", "es_vat", null)).toBe(true);
    expect(reviewTreatmentAllowed("vies_unavailable", "es_vat", "WAPIAAAAZ1")).toBe(false);
    expect(reviewTreatmentAllowed("vies_unavailable", "non_eu_not_subject", null)).toBe(false);
    expect(taxMention("eu_reverse_charge")).toBe("Inversión del sujeto pasivo");
    expect(vatCents(2000, "es_vat")).toBe(420);
  });
});
