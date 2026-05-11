import { describe, expect, it } from "vitest";
import { appRouter } from "@/lib/trpc/router";

describe("tRPC router scaffold", () => {
  it("exposes a minimal hidden health procedure", async () => {
    const caller = appRouter.createCaller({
      requestId: "req_test",
      userAgent: "vitest",
    });

    await expect(caller.health()).resolves.toEqual({
      ok: true,
      surface: "future_buyer_supplier_scaffold",
      requestId: "req_test",
    });
  });
});
