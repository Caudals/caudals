import { describe, expect, it } from "vitest";
import { generationStartIdempotencyKey } from "../../lib/evals/domain/generation-idempotency";

describe("automatic generation start idempotency", () => {
  const stableKey = "evaluation-auto-generation-abc123";

  it("keeps the same key for a first start or active job", () => {
    expect(generationStartIdempotencyKey(stableKey, { status: "idle", jobId: null })).toBe(stableKey);
    expect(generationStartIdempotencyKey(stableKey, { status: "drafting", jobId: "job-1" })).toBe(stableKey);
  });

  it.each(["paused", "quarantined", "failed", "needs_review"])("issues a deterministic fresh key for an explicit retry after %s", (status) => {
    const previous = { status, jobId: "job-1" };
    const key = generationStartIdempotencyKey(stableKey, previous);
    expect(key).not.toBe(stableKey);
    expect(key).toBe(generationStartIdempotencyKey(stableKey, previous));
    expect(key).toContain("retry-job-1");
    expect(key.length).toBeLessThanOrEqual(200);
  });

  it("does not create a retry key without a previous job", () => {
    expect(generationStartIdempotencyKey(stableKey, { status: "paused", jobId: null })).toBe(stableKey);
  });
});
