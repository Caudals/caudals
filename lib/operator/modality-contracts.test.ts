import { describe, expect, it, vi } from "vitest";
import {
  getModalityContractTemplate,
  validateEnrichmentManifest,
  validateModalityContractTemplate,
} from "@/lib/operator/modality-contracts";

describe("operator modality contracts", () => {
  it("defines complete operator contracts for covered production modalities", () => {
    for (const modality of [
      "video",
      "audio",
      "geospatial",
      "document",
      "timeseries",
    ]) {
      const template = getModalityContractTemplate(modality);

      expect(template).toBeTruthy();
      expect(validateModalityContractTemplate(template!)).toEqual({
        ok: true,
        missing: [],
      });
    }
  });

  it("captures document and time-series production gates", () => {
    expect(getModalityContractTemplate("document")).toMatchObject({
      canonicalFormat: "Parquet page records plus original PDF references",
      profileSignals: expect.arrayContaining(["ocr_confidence"]),
      privacyTreatments: expect.arrayContaining(["signature_redaction"]),
      packagingTargets: expect.arrayContaining(["page_parquet", "pdf_bundle"]),
    });
    expect(getModalityContractTemplate("timeseries")).toMatchObject({
      canonicalFormat: "Iceberg Parquet partitioned by event time and entity",
      profileSignals: expect.arrayContaining(["gap_distribution"]),
      cleaningOperators: expect.arrayContaining(["sample_rate_align"]),
      packagingTargets: expect.arrayContaining(["time_partitioned_parquet"]),
    });
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
