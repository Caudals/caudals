import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isActiveLearningLoopEnabled,
  scoreActiveLearningCandidate,
  selectActiveLearningCandidates,
  validateActiveLearningLoopEvidence,
} from "@/lib/operator/active-learning";

describe("active learning loop helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("scores uncertainty, diversity, and boundary evidence deterministically", () => {
    expect(
      scoreActiveLearningCandidate({
        itemRef: "silver/item-42",
        uncertaintyScore: 0.9,
        diversityScore: 0.7,
        boundaryScore: 0.5,
      })
    ).toMatchObject({
      combinedScore: 0.75,
      selectionReason:
        "uncertainty=0.900; diversity=0.700; boundary=0.500",
    });
  });

  it("selects the highest scoring reviewer candidates with stable priority", () => {
    expect(
      selectActiveLearningCandidates(
        [
          {
            itemRef: "silver/item-b",
            uncertaintyScore: 0.7,
            diversityScore: 0.7,
            boundaryScore: 0.7,
          },
          {
            itemRef: "silver/item-a",
            uncertaintyScore: 0.9,
            diversityScore: 0.8,
            boundaryScore: 0.6,
          },
        ],
        1
      )
    ).toEqual([
      expect.objectContaining({
        itemRef: "silver/item-a",
        combinedScore: 0.805,
        reviewerPriority: 1,
      }),
    ]);
  });

  it("fails closed when the active-learning feature flag is disabled", () => {
    vi.stubEnv("ACTIVE_LEARNING_LOOP_ENABLED", "false");

    expect(isActiveLearningLoopEnabled()).toBe(false);
    expect(
      validateActiveLearningLoopEvidence(
        {
          strategy: "hybrid_uncertainty_diversity",
          candidateSourceUri: "s3://silver/candidates.jsonl",
          embeddingIndexUri: "s3://indexes/lightly-v1.lance",
          modelSnapshotUri: "s3://models/assistant-v1",
          uncertaintyMetric: "entropy",
          diversityMetric: "embedding_distance",
          boundaryMetric: "margin",
          targetSampleSize: 128,
        },
        "review"
      )
    ).toMatchObject({
      ok: false,
      missing: ["feature_flag"],
    });
  });

  it("requires routing evidence before selected items enter reviewer queues", () => {
    expect(
      validateActiveLearningLoopEvidence(
        {
          strategy: "fiftyone_brain",
          candidateSourceUri: "s3://silver/candidates.jsonl",
          embeddingIndexUri: "s3://indexes/fiftyone-brain",
          modelSnapshotUri: "s3://models/assistant-v2",
          uncertaintyMetric: "least_confidence",
          diversityMetric: "brain_similarity",
          boundaryMetric: "margin",
          targetSampleSize: 32,
          selectedCount: 0,
        },
        "queued"
      )
    ).toMatchObject({
      ok: false,
      missing: [
        "selected_count",
        "selection_manifest_uri",
        "reviewer_routing",
      ],
    });
  });
});
