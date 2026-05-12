import { afterEach, describe, expect, it, vi } from "vitest";

import {
  summarizeDeltaChangeCounts,
  validateDeltaManifestEvidence,
  validateSubscriptionDeliveryEvidence,
} from "@/lib/operator/subscription-delivery";

describe("subscription delivery controls", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("summarizes delta change counts and flags deletion notices", () => {
    expect(
      summarizeDeltaChangeCounts({
        addedRecords: 1250,
        updatedRecords: 48,
        deletedRecords: 12,
        tombstonedRecords: 3,
      })
    ).toEqual({
      changedRecords: 1313,
      requiresDeletionNotice: true,
    });
  });

  it("requires cadence, channel, window, and schedule evidence for active feeds", () => {
    expect(
      validateSubscriptionDeliveryEvidence(
        {
          cadence: "monthly",
          deliveryChannel: "delta_share",
          rollingWindowVersions: 3,
          nextRefreshAt: "2026-06-01T09:00:00.000Z",
        },
        "active"
      )
    ).toEqual({
      ok: true,
      missing: [],
    });

    expect(
      validateSubscriptionDeliveryEvidence(
        {
          cadence: "daily",
          deliveryChannel: "unknown",
          rollingWindowVersions: 0,
        },
        "refreshing"
      )
    ).toEqual({
      ok: false,
      missing: [
        "cadence",
        "delivery_channel",
        "rolling_window_versions",
        "next_refresh_at",
      ],
    });
  });

  it("requires per-increment QA, rights, privacy, and delivery evidence before publish", () => {
    expect(
      validateDeltaManifestEvidence(
        {
          manifestUri: "s3://fixture/deltas/receipts-2026-05.json",
          manifestHash: "sha256:delta",
          previousDatasetVersionId: "dv_previous",
          deliveryId: "dl_refresh",
          qaReportId: "qr_refresh",
          addedRecords: 1200,
          updatedRecords: 25,
          deletedRecords: 4,
          tombstonedRecords: 0,
          totalRecords: 51221,
          qualityScore: 0.942,
          rightsReverified: true,
          privacyVerified: true,
        },
        "published"
      )
    ).toEqual({
      ok: true,
      missing: [],
    });

    expect(
      validateDeltaManifestEvidence(
        {
          manifestUri: "s3://fixture/deltas/receipts-2026-05.json",
          manifestHash: "sha256:delta",
        },
        "published"
      )
    ).toEqual({
      ok: false,
      missing: [
        "previous_dataset_version_id",
        "delivery_id",
        "qa_report_id",
        "quality_score",
        "rights_reverified",
        "privacy_verified",
      ],
    });
  });

  it("requires actionable deletion notice manifests before tombstoning", () => {
    expect(
      validateDeltaManifestEvidence(
        {
          manifestUri: "s3://fixture/deltas/receipts-2026-05.json",
          manifestHash: "sha256:delta",
          tombstonedRecords: 2,
          deletionNoticeUri: "s3://fixture/deltas/delete-required.json",
        },
        "tombstoned"
      )
    ).toEqual({
      ok: true,
      missing: [],
    });

    expect(
      validateDeltaManifestEvidence(
        {
          manifestUri: "s3://fixture/deltas/receipts-2026-05.json",
          manifestHash: "sha256:delta",
          tombstonedRecords: 0,
        },
        "tombstoned"
      )
    ).toEqual({
      ok: false,
      missing: ["tombstoned_records", "deletion_notice_uri"],
    });
  });

  it("honors the subscription delivery feature flag", () => {
    vi.stubEnv("SUBSCRIPTION_DELIVERY_ENABLED", "false");

    expect(
      validateDeltaManifestEvidence(
        {
          manifestUri: "s3://fixture/delta.json",
          manifestHash: "sha256:delta",
        },
        "ready"
      )
    ).toEqual({
      ok: false,
      missing: ["feature_flag"],
    });
  });
});
