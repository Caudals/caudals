export type SamplePreviewGate = "public" | "nda_required" | "operator_approved";
export type SamplePreviewAccessState =
  | "requested"
  | "nda_acknowledged"
  | "approved"
  | "denied"
  | "revoked"
  | "expired";

export type SamplePreviewPolicy = {
  gate?: SamplePreviewGate;
  watermark?: boolean;
};

export type SamplePreviewGateInput = {
  featureEnabled?: boolean;
  listingState: string;
  visibility: "public" | "partner" | "private";
  previewUri?: string | null;
  policy?: SamplePreviewPolicy | null;
  accessState?: SamplePreviewAccessState | null;
  ndaAcknowledgedAt?: string | Date | null;
};

export type SamplePreviewGateDecision = {
  allowed: boolean;
  reason:
    | "allowed_public"
    | "allowed_nda_acknowledged"
    | "allowed_operator_approved"
    | "feature_disabled"
    | "missing_preview"
    | "listing_not_active"
    | "nda_required"
    | "operator_approval_required"
    | "access_denied";
  watermark: boolean;
};

export function isCataloguePreviewGatingEnabled(env = process.env) {
  return env.CATALOGUE_PREVIEW_GATING_ENABLED !== "false";
}

export function evaluateSamplePreviewGate(
  input: SamplePreviewGateInput
): SamplePreviewGateDecision {
  const featureEnabled =
    input.featureEnabled ?? isCataloguePreviewGatingEnabled();
  const policy = input.policy ?? {};
  const gate = policy.gate ?? (input.visibility === "public" ? "public" : "nda_required");
  const watermark = policy.watermark !== false;

  if (!featureEnabled) {
    return { allowed: false, reason: "feature_disabled", watermark: false };
  }

  if (!input.previewUri) {
    return { allowed: false, reason: "missing_preview", watermark };
  }

  if (input.listingState !== "active") {
    return { allowed: false, reason: "listing_not_active", watermark };
  }

  if (gate === "public" && input.visibility === "public") {
    return { allowed: true, reason: "allowed_public", watermark };
  }

  if (["denied", "revoked", "expired"].includes(input.accessState ?? "")) {
    return { allowed: false, reason: "access_denied", watermark };
  }

  if (!input.ndaAcknowledgedAt) {
    return { allowed: false, reason: "nda_required", watermark };
  }

  if (gate === "operator_approved" && input.accessState !== "approved") {
    return { allowed: false, reason: "operator_approval_required", watermark };
  }

  return {
    allowed: true,
    reason:
      input.accessState === "approved"
        ? "allowed_operator_approved"
        : "allowed_nda_acknowledged",
    watermark,
  };
}
