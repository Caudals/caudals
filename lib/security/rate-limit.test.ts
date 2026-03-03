import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminModule from "@/lib/supabase/admin";
import {
  __resetRateLimitMemoryStoreForTests,
  consumeRateLimit,
  getClientIpFromHeaders,
} from "@/lib/security/rate-limit";

vi.mock("@/lib/security/structured-logger", () => ({
  logWarn: vi.fn(),
}));

describe("rate-limit", () => {
  beforeEach(() => {
    __resetRateLimitMemoryStoreForTests();
    vi.restoreAllMocks();
  });

  it("returns durable RPC result when abuse limiter RPC is available", async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString();
    const rpc = vi.fn(async () => ({
      data: [
        {
          allowed: true,
          limit_count: 5,
          remaining: 4,
          retry_after_seconds: 0,
          reset_at: resetAt,
        },
      ],
      error: null,
    }));

    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({ rpc } as any);

    const result = await consumeRateLimit({
      key: "waitlist:ip:127.0.0.1",
      limit: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterSeconds).toBe(0);
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("falls back to in-memory limiter and isolates keys across repeated requests", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "42883", message: "function missing" },
    }));
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({ rpc } as any);

    const a1 = await consumeRateLimit({
      key: "collaboration:ip:1.1.1.1",
      limit: 2,
      windowMs: 60_000,
    });
    const a2 = await consumeRateLimit({
      key: "collaboration:ip:1.1.1.1",
      limit: 2,
      windowMs: 60_000,
    });
    const a3 = await consumeRateLimit({
      key: "collaboration:ip:1.1.1.1",
      limit: 2,
      windowMs: 60_000,
    });
    const b1 = await consumeRateLimit({
      key: "collaboration:ip:2.2.2.2",
      limit: 2,
      windowMs: 60_000,
    });

    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(true);
    expect(a3.allowed).toBe(false);
    expect(a3.retryAfterSeconds).toBeGreaterThan(0);
    expect(b1.allowed).toBe(true);
    expect(b1.remaining).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it("extracts client IP from forwarded headers", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      "x-real-ip": "198.51.100.7",
    });

    expect(getClientIpFromHeaders(headers)).toBe("203.0.113.1");
  });
});
