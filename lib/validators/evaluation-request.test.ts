import { describe, expect, it } from "vitest";

import { locales } from "@/lib/i18n/config";
import { createTranslator, type MessageKey } from "@/lib/i18n/messages";

import {
  CONTACT_FORM_VERSION,
  evaluationRequestFormSchema,
  parseRequestedOffer,
} from "@/lib/validators/evaluation-request";

const basePayload = {
  fullName: "Lucía Martín",
  workEmail: "lucia@mutua.example",
  organization: "Mutua Ejemplo",
  systemType: "customer-assistant",
  sector: "insurance",
  ownerRole: "customer-service",
  systemAnswers: "Coverage and waiting periods for our health policies.",
};

describe("evaluationRequestFormSchema", () => {
  it("accepts a minimal request and normalises URLs", () => {
    const result = evaluationRequestFormSchema.safeParse({
      ...basePayload,
      organizationWebsite: "mutua.example",
      systemUrl: "mutua.example/asistente",
      message: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.organizationWebsite).toBe("https://mutua.example");
      expect(result.data.systemUrl).toBe("https://mutua.example/asistente");
      expect(result.data.message).toBeUndefined();
    }
  });

  it("accepts the five-field pilot request (launch L-30)", () => {
    const result = evaluationRequestFormSchema.safeParse({
      fullName: basePayload.fullName,
      workEmail: basePayload.workEmail,
      organization: basePayload.organization,
      sector: "insurance",
      systemAnswers: "The chat on mutua.example/ayuda, on coverage and claims.",
      requestedOffer: "pilot-evaluation",
      formVersion: CONTACT_FORM_VERSION,
      locale: "es",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.systemType).toBeUndefined();
      expect(result.data.ownerRole).toBeUndefined();
      expect(result.data.formVersion).toBe("pilot-request-v2");
    }
  });

  it("still accepts the earlier structured request, and checks its optional choices", () => {
    expect(evaluationRequestFormSchema.safeParse(basePayload).success).toBe(true);
    const result = evaluationRequestFormSchema.safeParse({ ...basePayload, systemType: "robot", ownerRole: "board" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { fieldErrors } = result.error.flatten();
      expect(fieldErrors.systemType).toContain("validation.systemTypeRequired");
      expect(fieldErrors.ownerRole).toContain("validation.ownerRequired");
    }
    expect(evaluationRequestFormSchema.safeParse({ ...basePayload, formVersion: "v9" }).success).toBe(false);
  });

  it("requires a name, a work email, the company, the sector and what the pilot should cover", () => {
    const result = evaluationRequestFormSchema.safeParse({ systemAnswers: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      // The schema runs where no locale is in scope, so it emits message keys
      // that the form resolves in the reader's language.
      const { fieldErrors } = result.error.flatten();
      expect(Object.keys(fieldErrors).sort()).toEqual(["fullName", "organization", "sector", "systemAnswers", "workEmail"]);
      expect(fieldErrors.sector).toContain("validation.sectorRequired");
      expect(fieldErrors.systemAnswers).toContain(
        "validation.systemAnswersRequired",
      );
    }
  });

  it("emits message keys that resolve in every locale", () => {
    // A key with no message would surface to a visitor as raw text.
    const result = evaluationRequestFormSchema.safeParse({ systemAnswers: "" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const keys = Object.values(result.error.flatten().fieldErrors)
      .flat()
      .filter((message): message is string => typeof message === "string");

    expect(keys.length).toBeGreaterThan(0);
    for (const locale of locales) {
      const t = createTranslator(locale);
      for (const key of keys) {
        expect(t(key as MessageKey), `${locale}:${key}`).not.toBe(key);
      }
    }
  });

  it("only accepts published offers as a starting point", () => {
    expect(
      evaluationRequestFormSchema.safeParse({
        ...basePayload,
        requestedOffer: "founding-offer",
      }).success,
    ).toBe(false);
    expect(parseRequestedOffer("pilot-evaluation")).toBe("pilot-evaluation");
    expect(parseRequestedOffer("dataset-build")).toBeUndefined();
    expect(parseRequestedOffer(undefined)).toBeUndefined();
  });
});
