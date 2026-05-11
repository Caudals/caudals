import { describe, expect, it, vi } from "vitest";
import {
  getModalityContractTemplate,
  validateEnrichmentManifest,
  validateModalityContractTemplate,
} from "@/lib/operator/modality-contracts";

describe("M2 modality contracts", () => {
  it("defines complete operator contracts for video, audio, and geospatial", () => {
    for (const modality of ["video", "audio", "geospatial"]) {
      const template = getModalityContractTemplate(modality);

      expect(template).toBeTruthy();
      expect(validateModalityContractTemplate(template!)).toEqual({
        ok: true,
        missing: [],
      });
    }
  });

  it("fails closed when the modality contract feature flag is disabled", () => {
    vi.stubEnv("MODALITY_CONTRACTS_ENABLED", "false");

    expect(
      validateModalityContractTemplate(getModalityContractTemplate("video")!)
    ).toEqual({
      ok: false,
      missing: ["feature_flag"],
    });

    vi.unstubAllEnvs();
  });

  it("rejects silent enrichment manifests missing license and reproducibility evidence", () => {
    expect(
      validateEnrichmentManifest({
        enrichmentClass: "geospatial",
        addedColumns: ["h3_cell"],
        sources: [],
        sourceLicense: "",
        computationMethod: "",
        spotCheckRate: 0.1,
        independencePassed: false,
        licenseCompatible: false,
      })
    ).toEqual({
      ok: false,
      missing: [
        "sources",
        "source_license",
        "computation_method",
        "independence_test",
        "license_compatibility",
      ],
    });
  });
});
