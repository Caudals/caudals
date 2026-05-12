import { describe, expect, it } from "vitest";

import { collaborationFormSchema } from "@/lib/validators/collaboration";

const basePayload = {
  fullName: "Jane Smith",
  workEmail: "jane@example.com",
  organization: "Acme AI",
  focusArea: "custom-dataset",
  message:
    "We need a multilingual receipt extraction dataset for model evaluation.",
};

describe("collaborationFormSchema", () => {
  it("requires a dataset reference or modality for buyer brief intake", () => {
    const result = collaborationFormSchema.safeParse(basePayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.datasetModality).toContain(
        "Please select the dataset type",
      );
    }
  });

  it("accepts catalogue-linked buyer requests without manual modality", () => {
    const result = collaborationFormSchema.safeParse({
      ...basePayload,
      catalogueListingId: "cl_01J20000000000000000000001",
    });

    expect(result.success).toBe(true);
  });
});
