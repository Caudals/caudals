import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildReleaseDocumentationBundle,
  validateReleaseDocumentationBundle,
} from "@/lib/operator/release-documentation";

describe("release documentation bundles", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("generates Croissant, Article 10, and HF mirror metadata for public releases", () => {
    const bundle = buildReleaseDocumentationBundle({
      dataset: {
        id: "dt_01J20000000000000000000001",
        name: "Iberian retail receipt corpus",
        modality: "document",
      },
      version: {
        id: "dv_01J20000000000000000000001",
        label: "v1.0-fixture",
        manifestUri: "s3://fixture/manifests/receipt-v1.yaml",
        contentHash: "sha256:fixture-receipt-v1",
        recordCount: 51221,
        qaScore: 0.914,
        releasedAt: "2026-05-10T12:00:00.000Z",
      },
      catalogue: {
        id: "cl_01J20000000000000000000001",
        title: "Operator-managed receipt corpus listing",
        visibility: "public",
        licenseTier: "evaluation",
        refreshCadence: "monthly",
        samplePreviewUri: "s3://fixture/previews/receipt-sample.jsonl",
      },
      license: {
        spdxId: "supplier-contract",
        permits: { train: true, eval: true, commercialInference: false },
        geo: ["EU"],
      },
      quality: {
        score: 0.914,
        verdict: "pass",
        dimensions: { layout_fidelity: 0.93 },
      },
      privacy: {
        state: "approved",
        findings: { email: 124 },
        treatments: { email: "tokenized" },
      },
      lineage: [
        {
          namespace: "caudals.fixture",
          jobName: "receipt-packaging",
          runId: "run_fixture_receipts_v1",
          eventTime: "2026-05-10T12:00:00.000Z",
        },
      ],
      modalityContract: {
        canonicalFormat: "Parquet page records plus original PDF references",
        packagingTargets: ["page_parquet", "pdf_bundle", "hf_datasets"],
        qaDimensions: ["layout_fidelity", "ocr_confidence"],
        privacyTreatments: ["signature_redaction", "printed_pii_redaction"],
      },
      signingKeyId: "sk_01J20000000000000000000001",
      documentationUri: "s3://fixture/docs/receipt-v1/release-documentation.json",
    });

    expect(bundle.validationSummary).toEqual({ status: "pass", missing: [] });
    expect(bundle.croissantManifest).toMatchObject({
      "@type": "Dataset",
      conformsTo: "http://mlcommons.org/croissant/1.0",
      name: "Iberian retail receipt corpus",
    });
    expect(bundle.article10Document).toMatchObject({
      dataGovernance: {
        datasetVersionId: "dv_01J20000000000000000000001",
        license: "supplier-contract",
      },
      biasTesting: {
        qualityVerdict: "pass",
      },
    });
    expect(bundle.hfMirror).toMatchObject({
      status: "planned",
      namespace: "caudals",
      repoId: "iberian-retail-receipt-corpus",
      license: "supplier-contract",
    });
    expect(bundle.packageManifest.requiredDocuments).toContain("croissantManifest");
  });

  it("fails closed when the release documentation feature flag is disabled", () => {
    vi.stubEnv("RELEASE_DOCUMENTATION_ENABLED", "false");

    const result = validateReleaseDocumentationBundle({
      packageManifest: { croissant: {} },
      croissantManifest: { "@context": {}, "@type": "Dataset" },
      article10Document: {
        dataGovernance: {},
        biasTesting: {},
        relevanceRepresentativeness: {},
      },
      requiredDocuments: {
        datasetCard: {},
        datasheet: {},
        croissantManifest: {},
        schemaDataDictionary: {},
        qualityScorecard: {},
        lineageProvenanceSummary: {},
        licensePermittedUseSummary: {},
        privacySummary: {},
        refreshPolicy: {},
        samplePreview: {},
      },
      hfMirror: { status: "not_applicable" },
    });

    expect(result).toEqual({ ok: false, missing: ["feature_flag"] });
  });
});
