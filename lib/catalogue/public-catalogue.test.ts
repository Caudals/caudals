import { describe, expect, it } from "vitest";

import {
  getPublicCatalogueData,
  normalizePublicCatalogueFilters,
} from "@/lib/catalogue/public-catalogue";

describe("public catalogue data", () => {
  it("normalizes public catalogue filters", () => {
    expect(
      normalizePublicCatalogueFilters({
        query: " receipt corpus ".repeat(12),
        modality: "Video",
        licenseTier: "Enterprise",
      }),
    ).toEqual({
      query: expect.stringMatching(/^receipt corpus/),
      modality: "video",
      licenseTier: "enterprise",
    });

    expect(
      normalizePublicCatalogueFilters({
        modality: "private",
        licenseTier: "internal",
      }),
    ).toMatchObject({ modality: "", licenseTier: "" });
  });

  it("maps only public active listings and applies sample-preview gates", async () => {
    const query = async <T extends Record<string, unknown>>(
      sql: string,
    ): Promise<T[]> => {
      expect(sql).toContain("cl.state = 'active'");
      expect(sql).toContain("cl.visibility = 'public'");
      expect(sql).toContain("dv.state = 'released'");

      return [
        {
          listingId: "cl_01J20000000000000000000001",
          listingTitle: "Iberian receipt extraction eval set",
          pricing: {
            priceCents: 990000,
            currency: "USD",
            billingModel: "pilot",
          },
          visibility: "public",
          listingState: "active",
          samplePreviewUri: "s3://fixture/previews/receipt-sample.jsonl",
          samplePreviewPolicy: { gate: "nda_required", watermark: true },
          refreshCadence: "monthly",
          licenseTier: "evaluation",
          updatedAt: "2026-05-10T12:00:00.000Z",
          datasetId: "dt_01J20000000000000000000001",
          datasetName: "Iberian retail receipt corpus",
          modality: "document",
          versionId: "dv_01J20000000000000000000001",
          versionLabel: "2026.05",
          manifestUri: "s3://fixture/manifests/receipt-v1.json",
          contentHash: "sha256:fixture",
          sizeBytes: 8192,
          recordCount: 125000,
          composedPermits: {
            train: true,
            finetune: true,
            eval: true,
            commercialInference: false,
          },
          qaScore: "0.914",
          releasedAt: "2026-05-10T12:00:00.000Z",
          piiState: "approved",
          piiFindings: { email: 124 },
          piiTreatments: { email: "tokenized" },
        },
      ] as unknown as T[];
    };

    const data = await getPublicCatalogueData(
      { modality: "document", licenseTier: "evaluation" },
      query,
    );

    expect(data.summary).toMatchObject({
      listingCount: 1,
      modalities: ["document"],
      averageQualityScore: 0.914,
      nextRefreshCadence: "monthly",
    });
    expect(data.listings[0]).toMatchObject({
      id: "cl_01J20000000000000000000001",
      licenseTier: "evaluation",
      qualityScore: 0.914,
      samplePreview: {
        decision: {
          allowed: false,
          reason: "nda_required",
          watermark: true,
        },
      },
    });
  });
});
