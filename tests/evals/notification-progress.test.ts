import { describe, expect, it } from "vitest";
import { jobProgress, notificationQuerySchema } from "../../lib/evals/repositories/notifications";
const run = { type: "run" as const, done: 4, total: 8, phase: "target_execution", grading_done: 0, grading_total: 0 };
describe("notification activity lifecycle", () => {
  it("keeps cancellation in progress until it completes and distinguishes it from failure", () => {
    expect(jobProgress({ ...run, status: "cancel_requested" })).toEqual({ percent: null, stage: "canceling", active: true });
    expect(jobProgress({ ...run, status: "canceled" })).toEqual({ percent: null, stage: "canceled", active: false });
    expect(jobProgress({ ...run, status: "failed" })).toEqual({ percent: null, stage: "failed", active: false });
  });
  it("validates complete cursors, page bounds and precision", () => {
    expect(notificationQuerySchema.safeParse({ before: { id: "bad", createdAt: "bad" } }).success).toBe(false);
    expect(notificationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(notificationQuerySchema.parse({ before: { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-10-07T10:00:00.000002Z" } }).before?.createdAt).toBe("2026-10-07T10:00:00.000002Z");
  });
});
