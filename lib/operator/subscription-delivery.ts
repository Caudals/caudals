export type SubscriptionCadence =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "event_driven"
  | "custom";

export type SubscriptionDeliveryChannel =
  | "signed_s3"
  | "signed_url"
  | "s3_share"
  | "warehouse_share"
  | "api"
  | "delta_share";

export type SubscriptionDeliveryEvidence = {
  cadence: string;
  deliveryChannel: string;
  rollingWindowVersions?: number | null;
  nextRefreshAt?: string | null;
};

export type DeltaManifestEvidence = {
  manifestUri?: string | null;
  manifestHash?: string | null;
  previousDatasetVersionId?: string | null;
  deliveryId?: string | null;
  qaReportId?: string | null;
  addedRecords?: number | null;
  updatedRecords?: number | null;
  deletedRecords?: number | null;
  tombstonedRecords?: number | null;
  totalRecords?: number | null;
  qualityScore?: number | null;
  rightsReverified?: boolean;
  privacyVerified?: boolean;
  deletionNoticeUri?: string | null;
};

export type DeltaChangeCounts = {
  addedRecords: number;
  updatedRecords: number;
  deletedRecords: number;
  tombstonedRecords: number;
};

export const subscriptionCadences = [
  "weekly",
  "monthly",
  "quarterly",
  "event_driven",
  "custom",
] as const;

export const subscriptionDeliveryChannels = [
  "signed_s3",
  "signed_url",
  "s3_share",
  "warehouse_share",
  "api",
  "delta_share",
] as const;

export function isSubscriptionDeliveryEnabled(env = process.env) {
  return env.SUBSCRIPTION_DELIVERY_ENABLED !== "false";
}

export function isSubscriptionCadence(
  value: string
): value is SubscriptionCadence {
  return subscriptionCadences.includes(value as SubscriptionCadence);
}

export function isSubscriptionDeliveryChannel(
  value: string
): value is SubscriptionDeliveryChannel {
  return subscriptionDeliveryChannels.includes(
    value as SubscriptionDeliveryChannel
  );
}

function isNonNegativeInteger(value: number | null | undefined) {
  return (
    value !== undefined &&
    value !== null &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function scoreInRange(value: number | null | undefined) {
  return value === undefined || value === null || (value >= 0 && value <= 1);
}

export function summarizeDeltaChangeCounts(counts: DeltaChangeCounts) {
  for (const [label, value] of Object.entries(counts)) {
    if (!isNonNegativeInteger(value)) {
      throw new Error(`${label} must be a non-negative integer.`);
    }
  }

  return {
    changedRecords:
      counts.addedRecords +
      counts.updatedRecords +
      counts.deletedRecords +
      counts.tombstonedRecords,
    requiresDeletionNotice: counts.tombstonedRecords > 0,
  };
}

export function validateSubscriptionDeliveryEvidence(
  evidence: SubscriptionDeliveryEvidence,
  state: string
) {
  const missing: string[] = [];

  if (!isSubscriptionDeliveryEnabled()) {
    missing.push("feature_flag");
  }

  if (!isSubscriptionCadence(evidence.cadence)) {
    missing.push("cadence");
  }

  if (!isSubscriptionDeliveryChannel(evidence.deliveryChannel)) {
    missing.push("delivery_channel");
  }

  if (
    evidence.rollingWindowVersions === undefined ||
    evidence.rollingWindowVersions === null ||
    evidence.rollingWindowVersions <= 0
  ) {
    missing.push("rolling_window_versions");
  }

  if (["active", "refreshing"].includes(state) && !evidence.nextRefreshAt) {
    missing.push("next_refresh_at");
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

export function validateDeltaManifestEvidence(
  evidence: DeltaManifestEvidence,
  state: string
) {
  const missing: string[] = [];

  if (!isSubscriptionDeliveryEnabled()) {
    missing.push("feature_flag");
  }

  for (const [key, label] of [
    ["manifestUri", "manifest_uri"],
    ["manifestHash", "manifest_hash"],
  ] as const) {
    if (!evidence[key]) {
      missing.push(label);
    }
  }

  for (const [value, label] of [
    [evidence.addedRecords, "added_records"],
    [evidence.updatedRecords, "updated_records"],
    [evidence.deletedRecords, "deleted_records"],
    [evidence.tombstonedRecords, "tombstoned_records"],
    [evidence.totalRecords, "total_records"],
  ] as const) {
    if (value !== undefined && value !== null && !isNonNegativeInteger(value)) {
      missing.push(label);
    }
  }

  if (!scoreInRange(evidence.qualityScore)) {
    missing.push("quality_score");
  }

  if (state === "published") {
    for (const [key, label] of [
      ["previousDatasetVersionId", "previous_dataset_version_id"],
      ["deliveryId", "delivery_id"],
      ["qaReportId", "qa_report_id"],
    ] as const) {
      if (!evidence[key]) {
        missing.push(label);
      }
    }

    if (evidence.qualityScore === undefined || evidence.qualityScore === null) {
      missing.push("quality_score");
    }

    if (!evidence.rightsReverified) {
      missing.push("rights_reverified");
    }

    if (!evidence.privacyVerified) {
      missing.push("privacy_verified");
    }
  }

  if (state === "tombstoned") {
    if (!evidence.tombstonedRecords || evidence.tombstonedRecords <= 0) {
      missing.push("tombstoned_records");
    }

    if (!evidence.deletionNoticeUri) {
      missing.push("deletion_notice_uri");
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
