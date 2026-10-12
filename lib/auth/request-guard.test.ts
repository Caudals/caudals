import { afterEach, describe, expect, it, vi } from "vitest";

const consumeRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args) }));

import { authRateLimit, withVisitorAddress } from "@/lib/auth/request-guard";

const request = (path: string, headers: Record<string, string>, method = "POST", body?: unknown) =>
  new Request(`https://app.caudals.com/api/auth${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

afterEach(() => consumeRateLimit.mockReset());

describe("auth request guard (launch L-08)", () => {
  it("labels requests with the visitor behind a Cloudflare edge, not the edge", () => {
    const labelled = withVisitorAddress(request("/sign-in/email", { "x-forwarded-for": "172.70.1.2", "cf-connecting-ip": "198.51.100.9" }, "GET"));
    expect(labelled.headers.get("x-forwarded-for")).toBe("198.51.100.9");
  });

  it("ignores a spoofed visitor header from a peer that is not Cloudflare", () => {
    const labelled = withVisitorAddress(request("/sign-in/email", { "x-forwarded-for": "203.0.113.5", "cf-connecting-ip": "198.51.100.9" }, "GET"));
    expect(labelled.headers.get("x-forwarded-for")).toBe("203.0.113.5");
    const unknown = withVisitorAddress(request("/sign-in/email", {}, "GET"));
    expect(unknown.headers.get("x-forwarded-for")).toBeNull();
  });

  it("keeps the body readable after the account limit reads it", async () => {
    consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    const original = request("/sign-in/email", { "x-forwarded-for": "203.0.113.5" }, "POST", { email: "Jane@Example.com", password: "x" });
    expect(await authRateLimit(original)).toBeNull();
    expect(await withVisitorAddress(original).json()).toEqual({ email: "Jane@Example.com", password: "x" });
    const keys = consumeRateLimit.mock.calls.map(([options]) => (options as { key: string }).key);
    expect(keys[0]).toBe("auth:signin-visitor:203.0.113.5");
    expect(keys[1]).toMatch(/^auth:signin-account:[0-9a-f]{64}$/);
  });

  it("answers 429 with Retry-After when a limit is spent, and ignores other routes", async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    const limited = await authRateLimit(request("/two-factor/verify-totp", { "x-forwarded-for": "203.0.113.5" }, "POST", { code: "000000" }));
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("retry-after")).toBe("120");
    expect(await limited?.json()).toMatchObject({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Try again in 2 minutes." });
    expect(await authRateLimit(request("/get-session", {}, "GET"))).toBeNull();
    expect(await authRateLimit(request("/sign-out", {}, "POST", {}))).toBeNull();
  });
});
