import { describe, expect, it } from "vitest";

import {
  buildQualityScorecard,
  cleaningOperatorRegistry,
  evaluateIntakeManifest,
  evaluatePipelineGate,
  evaluateQuasiIdentifierRisk,
  intakeChannelContracts,
  piiDetectorPool,
  planDatasetOperations,
  scanTextForPii,
  validateIntakeChannelContracts,
  validateCleaningOperatorLibrary,
  validatePackageManifest,
  type QualityDimensionKey,
} from "@/lib/operator/dataset-operations";

const completeDimensions = Object.fromEntries(
  [
    "completeness",
    "validity",
    "consistency",
    "uniqueness",
    "timeliness",
    "accuracy",
    "representativeness",
    "privacy",
    "provenance",
    "reproducibility",
  ].map((key) => [key, 0.92])
) as Record<QualityDimensionKey, number>;

describe("dataset operations blueprint contract", () => {
  it("ships a deterministic cleaning operator library with blueprint class coverage", () => {
    expect(cleaningOperatorRegistry.length).toBeGreaterThanOrEqual(30);
    expect(validateCleaningOperatorLibrary()).toEqual({ ok: true, missing: [] });
    expect(cleaningOperatorRegistry.map((operator) => operator.id)).toEqual(
      expect.arrayContaining([
        "parse-date",
        "iban-validate",
        "embedding-near-dup",
        "type-coerce-strict",
        "voice-activity-segment",
      ])
    );
  });

  it("models the required PII detector pool and redacts finding samples", () => {
    expect(piiDetectorPool.map((detector) => detector.kind)).toEqual(
      expect.arrayContaining([
        "presidio_pattern",
        "spacy_ner",
        "custom_recognizer",
        "modality_detector",
        "quasi_identifier",
      ])
    );

    const findings = scanTextForPii(
      "Contact maria@example.com, ES9121000418450200051332, or 123-45-6789."
    );

    expect(findings.map((finding) => finding.type)).toEqual(
      expect.arrayContaining(["email", "iban", "ssn"])
    );
    expect(findings.find((finding) => finding.type === "email")?.sample).not.toContain(
      "example.com"
    );
  });

  it("flags quasi-identifier buckets below the k-anonymity threshold", () => {
    const risk = evaluateQuasiIdentifierRisk(
      [
        { zip3: "280", ageBand: "30-39" },
        { zip3: "280", ageBand: "30-39" },
        { zip3: "080", ageBand: "60-69" },
      ],
      ["zip3", "ageBand"],
      3
    );

    expect(risk).toMatchObject({
      minK: 1,
      threshold: 3,
      highRisk: true,
    });
  });

  it("enforces G-1 through G-7 gate evidence, including DPIA for special data", () => {
    expect(evaluatePipelineGate("G-1", {})).toMatchObject({
      ok: false,
      missing: expect.arrayContaining(["provenanceManifest"]),
    });
    expect(
      evaluatePipelineGate("G-4", {
        piiMapReviewed: true,
        coverageReport: "s3://privacy/coverage.json",
        residualRiskNote: "Face blur residual risk accepted by privacy lead.",
        reverseMapVaultRef: "kms://vault/build-1",
        specialCategory: true,
      })
    ).toMatchObject({
      ok: false,
      missing: ["dpiaReference"],
    });
    expect(
      evaluatePipelineGate("G-7", {
        qualityScorecard: { composite: 0.91 },
        exceptionReport: { exceptions: [] },
        roundTripHashVerified: true,
        packageManifest: { uri: "s3://gold/manifest.json" },
        requiredDocumentsComplete: true,
        consumerTestPassed: true,
        croissantManifest: { "@type": "Dataset" },
      })
    ).toEqual({
      ok: true,
      gate: "G-7",
      label: "QA, packaging and release evidence",
      missing: [],
    });
  });

  it("models every §07 intake channel with pull and push guarantees", () => {
    expect(validateIntakeChannelContracts()).toEqual({ ok: true, missing: [] });
    expect(Object.keys(intakeChannelContracts).sort()).toEqual([
      "api_connector",
      "database_snapshot",
      "email_to_bucket",
      "object_storage_share",
      "physical_media",
      "public_scraper",
      "sftp",
      "signed_upload_url",
      "warehouse_share",
      "webhook",
    ]);
    expect(
      Object.values(intakeChannelContracts).map((contract) => contract.mode)
    ).toEqual(expect.arrayContaining(["pull", "push"]));
    expect(intakeChannelContracts.sftp.guarantees).toContain("event_on_drop");
    expect(intakeChannelContracts.webhook.requiredConfig).toContain(
      "signatureKeyRef"
    );
  });

  it("validates immutable bronze intake manifests and quarantines incomplete G-1 evidence", () => {
    const complete = evaluateIntakeManifest({
      intakeId: "in_01J2INTAKE",
      supplierAssetId: "sa_01J2ASSET",
      channel: "signed_upload_url",
      receivedAt: "2026-05-17T12:00:00.000Z",
      receivedBy: "caudals-ingest-svc-prod-04",
      contractRef: "ct_01J2#cl=4.2",
      jurisdiction: "EU-ES",
      objectUri: "s3://caudals-bronze/sa_01J2ASSET/raw.parquet",
      bytes: 2847113,
      sha256: "a".repeat(64),
      signedBySupplier: true,
      caudalsSignature: "ed25519:signature",
      chainOfCustody: ["signed-url", "intake-svc", "bronze-store"],
      permittedUseDeclaration: { train: true, eval: true },
      sensitivityFlag: "CONFIDENTIAL",
      refreshDeclaration: "one_shot",
      retentionPosture: { defaultYears: 7, dsar: "propagate" },
      evidence: {
        senderIdentity: "supplier-admin@example.com",
        uploadRequestId: "upl_01J2",
        contentLength: 2847113,
      },
    });

    expect(complete).toMatchObject({
      ok: true,
      gate: "G-1",
      channel: "signed_upload_url",
      mode: "push",
      quarantine: false,
      missing: [],
      invalid: [],
    });

    const incomplete = evaluateIntakeManifest({
      channel: "sftp",
      receivedAt: "not-a-date",
      sha256: "abc",
      bytes: 0,
      signedBySupplier: false,
    });

    expect(incomplete.ok).toBe(false);
    expect(incomplete.quarantine).toBe(true);
    expect(incomplete.missing).toEqual(
      expect.arrayContaining([
        "contractRef",
        "receivedAt",
        "bytes",
        "sha256",
        "signedBySupplier",
        "chainOfCustody",
        "evidence.dropEventId",
        "evidence.keyFingerprint",
      ])
    );
  });

  it("uses a weighted geometric mean so a zero dimension cannot be hidden", () => {
    const releasable = buildQualityScorecard({ dimensions: completeDimensions });

    expect(releasable.composite).toBe(0.92);
    expect(releasable.verdict).toBe("release");

    const blocked = buildQualityScorecard({
      dimensions: {
        ...completeDimensions,
        privacy: 0,
      },
    });

    expect(blocked.composite).toBe(0);
    expect(blocked.verdict).toBe("review");
    expect(blocked.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "LOW_PRIVACY" }),
      ])
    );
  });

  it("validates package manifests against the full G-7 export contract", () => {
    expect(
      validatePackageManifest({
        version: 1,
        buildHash: "sha256:abc",
        signingKeyId: "sk_01J2",
        croissant: { "@type": "Dataset" },
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
        roundTripHashes: { parquet: true },
        consumerTests: { hf: { passed: true } },
      })
    ).toEqual({ ok: true, missing: [] });

    expect(validatePackageManifest({}).missing).toEqual(
      expect.arrayContaining([
        "version",
        "buildHash",
        "requiredDocuments.datasetCard",
        "roundTripHashes",
        "consumerTests",
      ])
    );
  });

  it("plans modality-specific execution around gates, detectors, cleaning, and exports", () => {
    const plan = planDatasetOperations({
      modality: "image",
      targetFormats: ["coco", "webdataset"],
    });

    expect(plan.gates).toHaveLength(7);
    expect(plan.canonicalFormat).toContain("Lance");
    expect(plan.cleaningOperators).toEqual(
      expect.arrayContaining(["image-reencode", "perceptual-hash"])
    );
    expect(plan.piiDetectorPool.map((detector) => detector.kind)).toContain(
      "modality_detector"
    );
    expect(plan.intakeChannels.map((channel) => channel.channel)).toEqual(
      expect.arrayContaining(["object_storage_share", "signed_upload_url"])
    );
    expect(plan.packagingTargets).toEqual(["coco", "webdataset"]);
    expect(plan.unsupportedTargets).toEqual([]);
  });
});
