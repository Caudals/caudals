import { describe, expect, it } from "vitest";

import {
  getOperatorRecordCrudDescriptor,
  getOperatorRecordFieldDescriptors,
  getOperatorRecordFormGuidance,
  operatorModuleCreateOptions,
  operatorRecordCrudTypes,
} from "@/lib/operator/record-crud";

describe("operator record CRUD metadata", () => {
  it("provides guided form copy for every supported record type", () => {
    for (const recordType of operatorRecordCrudTypes) {
      const descriptor = getOperatorRecordCrudDescriptor(recordType);
      const guidance = getOperatorRecordFormGuidance(recordType);

      expect(descriptor, recordType).toBeTruthy();
      expect(guidance, recordType).toBeTruthy();
      expect(guidance?.primaryLabel, recordType).not.toEqual("Record title");
      expect(guidance?.primaryPlaceholder, recordType).toBeTruthy();
      expect(guidance?.detailLabel, recordType).not.toEqual("Record detail");
      expect(guidance?.detailPlaceholder, recordType).toBeTruthy();
      expect(guidance?.detailHelp, recordType).toBeTruthy();
    }
  });

  it("keeps every module create option backed by a createable descriptor", () => {
    for (const [moduleKey, recordTypes] of Object.entries(operatorModuleCreateOptions)) {
      for (const recordType of recordTypes) {
        const descriptor = getOperatorRecordCrudDescriptor(recordType);
        const guidance = getOperatorRecordFormGuidance(recordType);

        expect(descriptor?.canCreate, `${moduleKey}:${recordType}`).toBe(true);
        expect(guidance?.primaryLabel, `${moduleKey}:${recordType}`).toBeTruthy();
        expect(guidance?.detailLabel, `${moduleKey}:${recordType}`).toBeTruthy();
      }
    }
  });

  it("defines typed operational fields for high-value mutable records", () => {
    expect(getOperatorRecordFieldDescriptors("label_batch")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "queueDepth",
          kind: "integer",
          min: 0,
        }),
        expect.objectContaining({
          key: "agreementScore",
          kind: "decimal",
          min: 0,
          max: 1,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("active_learning_loop")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "strategy",
          allowedValues: [
            "fiftyone_brain",
            "lightly_embeddings",
            "hybrid_uncertainty_diversity",
          ],
        }),
        expect.objectContaining({
          key: "targetSampleSize",
          kind: "integer",
          min: 1,
        }),
        expect.objectContaining({
          key: "selectedCount",
          kind: "integer",
          min: 0,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("qa_report")).toEqual([
      expect.objectContaining({
        key: "compositeScore",
        kind: "decimal",
        min: 0,
        max: 1,
      }),
    ]);
    expect(getOperatorRecordFieldDescriptors("cleanlab_qa_pass")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "scanStrategy",
          allowedValues: [
            "confident_learning",
            "cleanlab_studio",
            "hybrid_confidence_agreement",
          ],
        }),
        expect.objectContaining({
          key: "scannedCount",
          kind: "integer",
          min: 1,
        }),
        expect.objectContaining({
          key: "estimatedErrorRate",
          kind: "decimal",
          min: 0,
          max: 1,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("quote")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "amountCents",
          kind: "integer",
          min: 0,
        }),
        expect.objectContaining({
          key: "currency",
          kind: "text",
          allowedValues: ["USD", "EUR", "GBP"],
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("supplier_asset")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "modality",
          allowedValues: expect.arrayContaining(["tabular", "text"]),
        }),
        expect.objectContaining({
          key: "refreshPolicy",
          allowedValues: ["one_shot", "scheduled", "on_event", "perpetual"],
        }),
        expect.objectContaining({
          key: "sensitivity",
          allowedValues: ["public", "confidential", "pii", "special"],
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("contract")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "contractType",
          allowedValues: ["supplier", "buyer", "nda", "dpa", "msa"],
        }),
        expect.objectContaining({
          key: "documentUri",
          kind: "text",
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("license_clause")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "permittedUses",
          kind: "text",
        }),
        expect.objectContaining({
          key: "shareAlike",
          allowedValues: ["true", "false"],
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("delivery")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "channel",
          allowedValues: [
            "signed_s3",
            "signed_url",
            "s3_share",
            "warehouse_share",
            "api",
            "delta_share",
          ],
        }),
        expect.objectContaining({
          key: "acceptanceWindowDays",
          kind: "integer",
          min: 1,
          max: 90,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("subscription")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "cadence",
          allowedValues: ["weekly", "monthly", "quarterly", "event_driven", "custom"],
        }),
        expect.objectContaining({
          key: "deliveryChannel",
          allowedValues: [
            "signed_s3",
            "signed_url",
            "s3_share",
            "warehouse_share",
            "api",
            "delta_share",
          ],
        }),
        expect.objectContaining({
          key: "rollingWindowVersions",
          kind: "integer",
          min: 1,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("delta_manifest")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "manifestUri",
          kind: "text",
        }),
        expect.objectContaining({
          key: "qualityScore",
          kind: "decimal",
          min: 0,
          max: 1,
        }),
        expect.objectContaining({
          key: "rightsReverified",
          allowedValues: ["true", "false"],
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("build")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "qScore",
          kind: "decimal",
          min: 0,
          max: 1,
        }),
        expect.objectContaining({
          key: "costBudgetCents",
          kind: "integer",
          min: 0,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("build_plan")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "licenseBlocked",
          allowedValues: ["true", "false"],
        }),
        expect.objectContaining({
          key: "permitSummary",
          kind: "text",
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("run")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "externalRunId",
          kind: "text",
        }),
        expect.objectContaining({
          key: "retryCount",
          kind: "integer",
          min: 0,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("cost_entry")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "amountCents",
          kind: "integer",
          min: 0,
        }),
        expect.objectContaining({
          key: "metadataSummary",
          kind: "text",
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("buyer_opportunity")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "modality",
          allowedValues: expect.arrayContaining(["mixed", "tabular"]),
        }),
        expect.objectContaining({
          key: "budgetRange",
          kind: "text",
        }),
        expect.objectContaining({
          key: "timeline",
          kind: "text",
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("dataset_brief")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "targetFormats",
          kind: "text",
        }),
        expect.objectContaining({
          key: "sensitivityConstraints",
          kind: "text",
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("dataset_version")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "recordCount",
          kind: "integer",
          min: 0,
        }),
        expect.objectContaining({
          key: "qaScore",
          kind: "decimal",
          min: 0,
          max: 1,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("modality_contract")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "modality",
          allowedValues: [
            "video",
            "audio",
            "geospatial",
            "document",
            "timeseries",
          ],
        }),
        expect.objectContaining({
          key: "canonicalFormat",
          kind: "text",
        }),
        expect.objectContaining({
          key: "packagingTargets",
          kind: "text",
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("enrichment_manifest")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "enrichmentClass",
          allowedValues: expect.arrayContaining(["geospatial", "embeddings"]),
        }),
        expect.objectContaining({
          key: "sourceLicense",
          kind: "text",
        }),
        expect.objectContaining({
          key: "spotCheckRate",
          kind: "decimal",
          min: 0,
          max: 1,
        }),
        expect.objectContaining({
          key: "licenseCompatible",
          allowedValues: ["true", "false"],
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("consent_record")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lawfulBasis",
          allowedValues: [
            "contract",
            "consent",
            "legitimate_interest",
            "legal_obligation",
          ],
        }),
        expect.objectContaining({
          key: "evidenceUri",
          kind: "text",
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("dsar_request")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "requestType",
          allowedValues: ["access", "delete", "correct", "export", "restrict"],
        }),
        expect.objectContaining({
          key: "slaDays",
          kind: "integer",
          min: 1,
          max: 90,
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("pii_map")).toEqual([
      expect.objectContaining({
        key: "treatmentSummary",
        kind: "text",
      }),
    ]);
    expect(getOperatorRecordFieldDescriptors("catalogue_listing")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "priceCents",
          kind: "integer",
          min: 0,
        }),
        expect.objectContaining({
          key: "billingModel",
          allowedValues: ["one_time", "subscription", "pilot", "revenue_share"],
        }),
      ])
    );
    expect(getOperatorRecordFieldDescriptors("private_offer")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "offerValueCents",
          kind: "integer",
          min: 0,
        }),
        expect.objectContaining({
          key: "expiresAt",
          kind: "text",
        }),
      ])
    );
  });
});
