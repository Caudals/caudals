import { describe, expect, it } from "vitest";

import {
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

  it("requires the system type, sector, owner and what the system answers", () => {
    const result = evaluationRequestFormSchema.safeParse({
      fullName: basePayload.fullName,
      workEmail: basePayload.workEmail,
      organization: basePayload.organization,
      systemAnswers: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const { fieldErrors } = result.error.flatten();
      expect(fieldErrors.systemType).toContain("Please select the type of system");
      expect(fieldErrors.sector).toContain("Please select your sector");
      expect(fieldErrors.ownerRole).toContain("Please select who owns the system");
      expect(fieldErrors.systemAnswers).toContain(
        "Tell us briefly what the system answers",
      );
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
