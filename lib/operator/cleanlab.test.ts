import { describe, expect, it } from "vitest";

import {
  estimateCleanlabErrorRate,
  rankCleanlabLabelIssues,
  validateCleanlabQaEvidence,
} from "@/lib/operator/cleanlab";

describe("cleanlab QA pass helpers", () => {
  it("estimates label error rate from scanned and suspected counts", () => {
    expect(estimateCleanlabErrorRate(128, 3)).toBe(0.02344);
    expect(() => estimateCleanlabErrorRate(0, 0)).toThrow(
      /positive integer/
    );
    expect(() => estimateCleanlabErrorRate(8, 9)).toThrow(/scanned count/);
  });

  it("ranks suspected label issues for reviewer requeue", () => {
    expect(
      rankCleanlabLabelIssues([
        {
          itemRef: "silver/doc/2",
          observedLabel: "invoice",
          suggestedLabel: "receipt",
          issueScore: 0.88,
          confidence: 0.76,
          issueReason: "neighbor labels disagree",
        },
        {
          itemRef: "silver/doc/1",
          observedLabel: "invoice",
          suggestedLabel: "quote",
          issueScore: 0.94,
          confidence: 0.81,
          issueReason: "self-confidence below class prior",
        },
      ])
    ).toEqual([
      expect.objectContaining({
        itemRef: "silver/doc/1",
        reviewerPriority: 1,
        routeState: "suspected",
      }),
      expect.objectContaining({
        itemRef: "silver/doc/2",
        reviewerPriority: 2,
        routeState: "suspected",
      }),
    ]);
  });

  it("requires requeue manifests and threshold pass evidence by state", () => {
    const baseEvidence = {
      scanStrategy: "confident_learning",
      inputManifestUri: "s3://fixture/labels/pass-1.jsonl",
      cleanlabReportUri: "s3://fixture/qa/cleanlab-report.json",
      modelSnapshotUri: "s3://fixture/models/label-error-detector",
      scannedCount: 128,
      suspectedLabelErrors: 3,
      estimatedErrorRate: 0.02344,
      errorRateThreshold: 0.03,
      requeueCount: 3,
      requeueManifestUri: "s3://fixture/labels/requeue.jsonl",
    };

    expect(validateCleanlabQaEvidence(baseEvidence, "requeue")).toEqual({
      ok: true,
      missing: [],
    });

    expect(
      validateCleanlabQaEvidence(
        {
          ...baseEvidence,
          estimatedErrorRate: 0.05,
        },
        "accepted"
      )
    ).toEqual(
      expect.objectContaining({
        ok: false,
        missing: expect.arrayContaining(["error_rate_threshold_pass"]),
      })
    );
  });
});
