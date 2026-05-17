import { describe, expect, it, vi } from "vitest";
import {
  getModalityContractTemplate,
  validateEnrichmentManifest,
  validateModalityContractTemplate,
} from "@/lib/operator/modality-contracts";

describe("operator modality contracts", () => {
  it("defines complete operator contracts for covered production modalities", () => {
    for (const modality of [
      "tabular",
      "text",
      "image",
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

  it("captures tabular, text, and image contracts as first-class modalities", () => {
    expect(getModalityContractTemplate("tabular")).toMatchObject({
      canonicalFormat: "Iceberg Parquet with zstd compression",
      profileSignals: expect.arrayContaining(["key_uniqueness"]),
      privacyTreatments: expect.arrayContaining(["quasi_identifier_review"]),
      packagingTargets: expect.arrayContaining(["parquet", "csv"]),
    });
    expect(getModalityContractTemplate("text")).toMatchObject({
      profileSignals: expect.arrayContaining(["token_count"]),
      privacyTreatments: expect.arrayContaining(["spacy_ner_review"]),
      packagingTargets: expect.arrayContaining(["jsonl", "hf_datasets"]),
    });
    expect(getModalityContractTemplate("image")).toMatchObject({
      canonicalFormat: "Lance dataset with media references",
      cleaningOperators: expect.arrayContaining(["exif_strip"]),
      labelingWidgets: expect.arrayContaining(["bounding_box", "mask"]),
      packagingTargets: expect.arrayContaining(["coco", "yolo"]),
    });
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
