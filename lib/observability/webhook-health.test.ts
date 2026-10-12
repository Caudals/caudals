import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/evals/repositories/db", () => ({ getEvalsPool: () => ({ query: async () => ({ rows: [{ ok: 1 }] }) }) }));

import { webhookHealth, type WebhookHealthCheck } from "@/lib/observability/webhook-health";

describe("webhook health (launch L-08)", () => {
  it("is ok only when every check passes, and never says why", async () => {
    const ok: WebhookHealthCheck = { name: "database", run: async () => true };
    const broken: WebhookHealthCheck = { name: "stripe", run: async () => { throw new Error("whsec_secret missing"); } };
    expect(await webhookHealth([ok])).toEqual({ status: "ok", checks: { database: "ok" } });
    const failing = await webhookHealth([ok, broken]);
    expect(failing).toEqual({ status: "failing", checks: { database: "ok", stripe: "failing" } });
    expect(JSON.stringify(failing)).not.toContain("whsec");
  });

  it("treats a hung check as failing", async () => {
    vi.useFakeTimers();
    const hung: WebhookHealthCheck = { name: "slow", run: () => new Promise<boolean>(() => undefined) };
    const pending = webhookHealth([hung]);
    await vi.advanceTimersByTimeAsync(3100);
    expect(await pending).toEqual({ status: "failing", checks: { slow: "failing" } });
    vi.useRealTimers();
  });
});
