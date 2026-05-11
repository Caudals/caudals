export type ActiveLearningStrategy =
  | "fiftyone_brain"
  | "lightly_embeddings"
  | "hybrid_uncertainty_diversity";

export type ActiveLearningLoopEvidence = {
  strategy: string;
  candidateSourceUri?: string | null;
  embeddingIndexUri?: string | null;
  modelSnapshotUri?: string | null;
  uncertaintyMetric?: string | null;
  diversityMetric?: string | null;
  boundaryMetric?: string | null;
  targetSampleSize?: number | null;
  selectedCount?: number | null;
  selectionManifestUri?: string | null;
  reviewerRouting?: string | null;
};

export type ActiveLearningCandidate = {
  itemRef: string;
  uncertaintyScore: number;
  diversityScore: number;
  boundaryScore: number;
};

export type RankedActiveLearningCandidate = ActiveLearningCandidate & {
  combinedScore: number;
  selectionReason: string;
  reviewerPriority: number;
};

export const activeLearningStrategies = [
  "fiftyone_brain",
  "lightly_embeddings",
  "hybrid_uncertainty_diversity",
] as const;

const scoreWeights = {
  uncertainty: 0.45,
  diversity: 0.35,
  boundary: 0.2,
} as const;

export function isActiveLearningLoopEnabled(env = process.env) {
  return env.ACTIVE_LEARNING_LOOP_ENABLED !== "false";
}

export function isActiveLearningStrategy(
  value: string
): value is ActiveLearningStrategy {
  return activeLearningStrategies.includes(value as ActiveLearningStrategy);
}

function scoreInRange(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function scoreActiveLearningCandidate(
  candidate: ActiveLearningCandidate
): RankedActiveLearningCandidate {
  for (const [label, score] of Object.entries({
    uncertainty: candidate.uncertaintyScore,
    diversity: candidate.diversityScore,
    boundary: candidate.boundaryScore,
  })) {
    if (!scoreInRange(score)) {
      throw new Error(`Active-learning ${label} score must be between 0 and 1.`);
    }
  }

  const combinedScore =
    candidate.uncertaintyScore * scoreWeights.uncertainty +
    candidate.diversityScore * scoreWeights.diversity +
    candidate.boundaryScore * scoreWeights.boundary;

  return {
    ...candidate,
    combinedScore: Number(combinedScore.toFixed(4)),
    reviewerPriority: 0,
    selectionReason: [
      `uncertainty=${candidate.uncertaintyScore.toFixed(3)}`,
      `diversity=${candidate.diversityScore.toFixed(3)}`,
      `boundary=${candidate.boundaryScore.toFixed(3)}`,
    ].join("; "),
  };
}

export function selectActiveLearningCandidates(
  candidates: ActiveLearningCandidate[],
  limit: number
): RankedActiveLearningCandidate[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("Active-learning selection limit must be a positive integer.");
  }

  return candidates
    .map(scoreActiveLearningCandidate)
    .sort((left, right) => {
      if (right.combinedScore !== left.combinedScore) {
        return right.combinedScore - left.combinedScore;
      }

      return left.itemRef.localeCompare(right.itemRef);
    })
    .slice(0, limit)
    .map((candidate, index) => ({
      ...candidate,
      reviewerPriority: index + 1,
    }));
}

export function validateActiveLearningLoopEvidence(
  evidence: ActiveLearningLoopEvidence,
  state: string
) {
  const missing: string[] = [];

  if (!isActiveLearningLoopEnabled()) {
    missing.push("feature_flag");
  }

  if (!isActiveLearningStrategy(evidence.strategy)) {
    missing.push("strategy");
  }

  for (const [key, label] of [
    ["candidateSourceUri", "candidate_source_uri"],
    ["embeddingIndexUri", "embedding_index_uri"],
    ["modelSnapshotUri", "model_snapshot_uri"],
    ["uncertaintyMetric", "uncertainty_metric"],
    ["diversityMetric", "diversity_metric"],
    ["boundaryMetric", "boundary_metric"],
  ] as const) {
    if (!evidence[key]) {
      missing.push(label);
    }
  }

  if (!evidence.targetSampleSize || evidence.targetSampleSize <= 0) {
    missing.push("target_sample_size");
  }

  if (
    evidence.selectedCount !== undefined &&
    evidence.selectedCount !== null &&
    evidence.targetSampleSize !== undefined &&
    evidence.targetSampleSize !== null &&
    evidence.selectedCount > evidence.targetSampleSize
  ) {
    missing.push("selected_count_limit");
  }

  if (["queued", "closed"].includes(state)) {
    if (!evidence.selectedCount || evidence.selectedCount <= 0) {
      missing.push("selected_count");
    }
    if (!evidence.selectionManifestUri) {
      missing.push("selection_manifest_uri");
    }
    if (!evidence.reviewerRouting) {
      missing.push("reviewer_routing");
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
