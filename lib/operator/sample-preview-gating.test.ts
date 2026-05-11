import { describe, expect, it, vi, afterEach } from "vitest";

import {
  evaluateSamplePreviewGate,
  isCataloguePreviewGatingEnabled,
} from "@/lib/operator/sample-preview-gating";

describe("sample preview gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires an active listing with a preview artefact", () => {
    expect(
      evaluateSamplePreviewGate({
        featureEnabled: true,
        listingState: "review",
        visibility: "private",
        previewUri: "s3://preview.jsonl",
        accessState: "approved",
        ndaAcknowledgedAt: "2026-05-11T12:00:00Z",
      })
    ).toMatchObject({ allowed: false, reason: "listing_not_active" });

    expect(
      evaluateSamplePreviewGate({
        featureEnabled: true,
        listingState: "active",
        visibility: "private",
        previewUri: null,
        accessState: "approved",
        ndaAcknowledgedAt: "2026-05-11T12:00:00Z",
      })
    ).toMatchObject({ allowed: false, reason: "missing_preview" });
  });

  it("allows NDA-gated previews after acknowledgement", () => {
    expect(
      evaluateSamplePreviewGate({
        featureEnabled: true,
        listingState: "active",
        visibility: "private",
        previewUri: "s3://preview.jsonl",
        policy: { gate: "nda_required", watermark: true },
        accessState: "nda_acknowledged",
        ndaAcknowledgedAt: "2026-05-11T12:00:00Z",
      })
    ).toEqual({
      allowed: true,
      reason: "allowed_nda_acknowledged",
      watermark: true,
    });
  });

  it("requires operator approval for private-offer previews", () => {
    expect(
      evaluateSamplePreviewGate({
        featureEnabled: true,
        listingState: "active",
        visibility: "private",
        previewUri: "s3://preview.jsonl",
        policy: { gate: "operator_approved", watermark: true },
        accessState: "nda_acknowledged",
        ndaAcknowledgedAt: "2026-05-11T12:00:00Z",
      })
    ).toMatchObject({
      allowed: false,
      reason: "operator_approval_required",
    });
  });

  it("is controlled by the catalogue preview feature flag", () => {
    vi.stubEnv("CATALOGUE_PREVIEW_GATING_ENABLED", "false");

    expect(isCataloguePreviewGatingEnabled()).toBe(false);
    expect(
      evaluateSamplePreviewGate({
        listingState: "active",
        visibility: "public",
        previewUri: "s3://preview.jsonl",
        policy: { gate: "public" },
      })
    ).toMatchObject({ allowed: false, reason: "feature_disabled" });
  });
});
