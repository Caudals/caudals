import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatScorecardDimensionLabel,
  getBuyerWorkspaceData,
  mapScorecardDimensions,
} from "@/lib/buyer/workspace";
import type { CurrentBuyerSession } from "@/lib/buyer/session";

const buyerSession: CurrentBuyerSession = {
  authUser: {
    id: "au_buyer",
    email: "buyer@example.com",
    name: "Buyer User",
  },
  buyer: {
    id: "or_buyer",
    displayName: "Buyer Co",
    legalName: "Buyer Company Inc",
    jurisdiction: "US",
  },
  authOrganization: {
    id: "ao_buyer",
    name: "Buyer Workspace",
  },
  tenantOrgId: "or_tenant",
  role: "buyer_admin",
};

describe("buyer workspace data", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes scorecard dimensions for display", () => {
    expect(formatScorecardDimensionLabel("label_accuracy")).toBe(
      "Label Accuracy",
    );
    expect(
      mapScorecardDimensions({ privacy: 1, completeness: "0.97", note: "n/a" }),
    ).toEqual([
      { key: "completeness", label: "Completeness", score: 0.97 },
      { key: "privacy", label: "Privacy", score: 1 },
    ]);
  });

  it("fetches only deliveries for the authenticated buyer organization", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "dl_1",
          state: "ready",
          channel: "delta_share",
          receipt: { object: "s3://delivery.parquet" },
          createdAt: new Date("2026-05-10T12:00:00.000Z"),
          updatedAt: new Date("2026-05-11T12:00:00.000Z"),
          subscriptionId: "su_1",
          cadence: "monthly",
          deliveryChannel: "delta_share",
          subscriptionState: "active",
          nextRefreshAt: new Date("2026-06-01T12:00:00.000Z"),
          rollingWindowVersions: 3,
          deliveryPolicy: {},
          datasetId: "dt_1",
          datasetName: "Receipt corpus",
          modality: "document",
          datasetVersionId: "dv_1",
          versionLabel: "v1",
          datasetManifestUri: "s3://manifest.yaml",
          contentHash: "sha256:content",
          recordCount: "50000",
          datasetQaScore: "0.91",
          releasedAt: new Date("2026-05-10T12:00:00.000Z"),
          composedPermits: { train: true, commercialInference: true },
          deltaManifestId: "dm_1",
          deltaState: "published",
          deltaManifestUri: "s3://delta.json",
          deltaManifestHash: "sha256:delta",
          addedRecords: "1250",
          updatedRecords: "48",
          deletedRecords: "4",
          tombstonedRecords: "0",
          totalRecords: "51221",
          deltaQualityScore: "0.944",
          rightsReverified: true,
          privacyVerified: true,
          deltaSummary: { summary: "Monthly increment" },
          qaReportId: "qr_1",
          qaDimensions: { accuracy: 0.86, privacy: 1 },
          qaCompositeScore: "0.91",
          qaVerdict: "review",
          piiState: "approved",
          piiFindings: { email: 12 },
          piiTreatments: { email: "tokenized" },
          contractId: "ct_1",
          contractState: "active",
          contractEndsAt: new Date("2027-05-10T12:00:00.000Z"),
          offerTerms: { scope: "evaluation+fine-tuning" },
        },
      ])
      .mockResolvedValueOnce([
        {
          activeSubscriptions: 1,
          nextRefreshAt: new Date("2026-06-01T12:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "su_1",
          state: "active",
          cadence: "monthly",
          deliveryChannel: "delta_share",
          nextRefreshAt: new Date("2026-06-01T12:00:00.000Z"),
          rollingWindowVersions: 3,
          retentionPolicy: { retentionDays: 365 },
          deliveryPolicy: { summary: "Rolling refreshes" },
          datasetId: "dt_1",
          datasetName: "Receipt corpus",
          modality: "document",
          currentVersionId: "dv_1",
          currentVersionLabel: "v1",
          currentVersionRecords: "50000",
          currentVersionQaScore: "0.91",
          currentVersionReleasedAt: new Date("2026-05-10T12:00:00.000Z"),
          contractId: "ct_1",
          contractState: "active",
          contractEndsAt: new Date("2027-05-10T12:00:00.000Z"),
          privateOfferId: "po_1",
          privateOfferState: "accepted",
          privateOfferTerms: { scope: "evaluation+fine-tuning" },
          latestDeltaId: "dm_1",
          latestDeltaState: "ready",
          latestDeltaRecords: "51221",
          latestDeltaQualityScore: "0.944",
          latestDeltaPublishedAt: new Date("2026-05-11T12:00:00.000Z"),
          latestDeltaRightsReverified: true,
          latestDeltaPrivacyVerified: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "iv_1",
          state: "open",
          stripeInvoiceId: "in_1",
          amountCents: "990000",
          currency: "USD",
          createdAt: new Date("2026-05-10T12:00:00.000Z"),
          updatedAt: new Date("2026-05-11T12:00:00.000Z"),
          quoteId: "qt_1",
          quoteState: "sent",
          buyerOpportunityId: "bo_1",
          buyerOpportunityTitle: "Retail receipt pilot",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "in_1",
          provider: "spaces",
          state: "active",
          displayName: "Buyer delivery bucket",
          metadata: {
            destination: "s3://buyer/caudals-deliveries",
            authMode: "cross-account role",
          },
          lastVerifiedAt: new Date("2026-05-11T12:00:00.000Z"),
          updatedAt: new Date("2026-05-11T12:00:00.000Z"),
        },
      ]);

    const data = await getBuyerWorkspaceData(buyerSession, query);

    expect(data.deliveries[0]).toMatchObject({
      id: "dl_1",
      dataset: { name: "Receipt corpus" },
      delta: {
        totalRecords: 51221,
        rightsReverified: true,
        privacyVerified: true,
      },
      scorecard: {
        compositeScore: 0.91,
        dimensions: [
          { key: "accuracy", label: "Accuracy", score: 0.86 },
          { key: "privacy", label: "Privacy", score: 1 },
        ],
      },
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("WHERE dl.buyer_org_id = $1"),
      ["or_buyer"],
      { orgId: "or_tenant" },
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("WHERE su.buyer_org_id = $1"),
      ["or_buyer"],
      { orgId: "or_tenant" },
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("COALESCE(iv.buyer_org_id, qt.buyer_org_id) = $1"),
      ["or_buyer"],
      { orgId: "or_tenant" },
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("WHERE buyer_org_id = $1"),
      ["or_buyer"],
      { orgId: "or_tenant" },
    );
    expect(data.summary).toMatchObject({
      deliveryCount: 1,
      activeSubscriptions: 1,
      averageQualityScore: 0.91,
      openInvoiceCount: 1,
      openInvoiceAmountCents: 990000,
      activeIntegrationCount: 1,
    });
    expect(data.subscriptions[0]).toMatchObject({
      id: "su_1",
      latestDelta: {
        totalRecords: 51221,
        rightsReverified: true,
        privacyVerified: true,
      },
    });
    expect(data.invoices[0]).toMatchObject({
      id: "iv_1",
      amountCents: 990000,
      opportunity: { title: "Retail receipt pilot" },
    });
    expect(data.integrations[0]).toMatchObject({
      id: "in_1",
      displayName: "Buyer delivery bucket",
      metadata: { destination: "s3://buyer/caudals-deliveries" },
    });
  });

  it("keeps v1 commercial panels behind a feature flag", async () => {
    vi.stubEnv("BUYER_WORKSPACE_V1_ENABLED", "false");
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          activeSubscriptions: 0,
          nextRefreshAt: null,
        },
      ]);

    const data = await getBuyerWorkspaceData(buyerSession, query);

    expect(query).toHaveBeenCalledTimes(2);
    expect(data.subscriptions).toEqual([]);
    expect(data.invoices).toEqual([]);
    expect(data.integrations).toEqual([]);
    expect(data.summary).toMatchObject({
      openInvoiceCount: 0,
      openInvoiceAmountCents: 0,
      activeIntegrationCount: 0,
    });
  });
});
