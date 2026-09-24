const restartableGenerationStatuses = new Set(["paused", "quarantined", "failed", "needs_review"]);

export function generationStartIdempotencyKey(
  stableKey: string,
  previous: { status: string; jobId: string | null },
): string {
  if (previous.jobId && restartableGenerationStatuses.has(previous.status)) {
    return `${stableKey}-retry-${previous.jobId}`;
  }
  return stableKey;
}
