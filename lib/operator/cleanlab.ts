export type CleanlabScanStrategy =
  | "confident_learning"
  | "cleanlab_studio"
  | "hybrid_confidence_agreement";

export type CleanlabQaEvidence = {
  scanStrategy: string;
  inputManifestUri?: string | null;
  cleanlabReportUri?: string | null;
  modelSnapshotUri?: string | null;
  scannedCount?: number | null;
  suspectedLabelErrors?: number | null;
  estimatedErrorRate?: number | null;
  errorRateThreshold?: number | null;
  requeueCount?: number | null;
  requeueManifestUri?: string | null;
};

export type CleanlabLabelIssue = {
  itemRef: string;
  observedLabel: string;
  suggestedLabel?: string | null;
  issueScore: number;
  confidence?: number | null;
  issueReason: string;
};

export type RankedCleanlabLabelIssue = CleanlabLabelIssue & {
  reviewerPriority: number;
  routeState: "suspected";
};

export const cleanlabScanStrategies = [
  "confident_learning",
  "cleanlab_studio",
  "hybrid_confidence_agreement",
] as const;

export function isCleanlabQaPassEnabled(env = process.env) {
  return env.CLEANLAB_QA_PASS_ENABLED !== "false";
}

export function isCleanlabScanStrategy(
  value: string
): value is CleanlabScanStrategy {
  return cleanlabScanStrategies.includes(value as CleanlabScanStrategy);
}

function scoreInRange(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function estimateCleanlabErrorRate(
  scannedCount: number,
  suspectedLabelErrors: number
) {
  if (!Number.isSafeInteger(scannedCount) || scannedCount <= 0) {
    throw new Error("Cleanlab scanned count must be a positive integer.");
  }

  if (
    !Number.isSafeInteger(suspectedLabelErrors) ||
    suspectedLabelErrors < 0 ||
    suspectedLabelErrors > scannedCount
  ) {
    throw new Error(
      "Cleanlab suspected label errors must be between 0 and scanned count."
    );
  }

  return Number((suspectedLabelErrors / scannedCount).toFixed(5));
}

export function rankCleanlabLabelIssues(
  issues: CleanlabLabelIssue[]
): RankedCleanlabLabelIssue[] {
  return issues
    .map((issue) => {
      if (!issue.itemRef || !issue.observedLabel || !issue.issueReason) {
        throw new Error("Cleanlab label issues require item, label, and reason.");
      }

      if (!scoreInRange(issue.issueScore)) {
        throw new Error("Cleanlab issue score must be between 0 and 1.");
      }

      if (
        issue.confidence !== undefined &&
        issue.confidence !== null &&
        !scoreInRange(issue.confidence)
      ) {
        throw new Error("Cleanlab issue confidence must be between 0 and 1.");
      }

      return issue;
    })
    .sort((left, right) => {
      if (right.issueScore !== left.issueScore) {
        return right.issueScore - left.issueScore;
      }

      return left.itemRef.localeCompare(right.itemRef);
    })
    .map((issue, index) => ({
      ...issue,
      reviewerPriority: index + 1,
      routeState: "suspected",
    }));
}

export function validateCleanlabQaEvidence(
  evidence: CleanlabQaEvidence,
  state: string
) {
  const missing: string[] = [];

  if (!isCleanlabQaPassEnabled()) {
    missing.push("feature_flag");
  }

  if (!isCleanlabScanStrategy(evidence.scanStrategy)) {
    missing.push("scan_strategy");
  }

  for (const [key, label] of [
    ["inputManifestUri", "input_manifest_uri"],
    ["cleanlabReportUri", "cleanlab_report_uri"],
    ["modelSnapshotUri", "model_snapshot_uri"],
  ] as const) {
    if (!evidence[key]) {
      missing.push(label);
    }
  }

  if (!evidence.scannedCount || evidence.scannedCount <= 0) {
    missing.push("scanned_count");
  }

  if (
    evidence.suspectedLabelErrors === undefined ||
    evidence.suspectedLabelErrors === null ||
    evidence.suspectedLabelErrors < 0
  ) {
    missing.push("suspected_label_errors");
  }

  if (
    evidence.scannedCount !== undefined &&
    evidence.scannedCount !== null &&
    evidence.suspectedLabelErrors !== undefined &&
    evidence.suspectedLabelErrors !== null &&
    evidence.suspectedLabelErrors > evidence.scannedCount
  ) {
    missing.push("suspected_label_errors_limit");
  }

  for (const [value, label] of [
    [evidence.estimatedErrorRate, "estimated_error_rate"],
    [evidence.errorRateThreshold, "error_rate_threshold"],
  ] as const) {
    if (value === undefined || value === null || !scoreInRange(value)) {
      missing.push(label);
    }
  }

  if (
    evidence.requeueCount !== undefined &&
    evidence.requeueCount !== null &&
    evidence.suspectedLabelErrors !== undefined &&
    evidence.suspectedLabelErrors !== null &&
    evidence.requeueCount > evidence.suspectedLabelErrors
  ) {
    missing.push("requeue_count_limit");
  }

  if (state === "requeue") {
    if (!evidence.requeueCount || evidence.requeueCount <= 0) {
      missing.push("requeue_count");
    }
    if (!evidence.requeueManifestUri) {
      missing.push("requeue_manifest_uri");
    }
  }

  if (
    state === "accepted" &&
    evidence.estimatedErrorRate !== undefined &&
    evidence.estimatedErrorRate !== null &&
    evidence.errorRateThreshold !== undefined &&
    evidence.errorRateThreshold !== null &&
    evidence.estimatedErrorRate > evidence.errorRateThreshold
  ) {
    missing.push("error_rate_threshold_pass");
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
