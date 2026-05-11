import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`https://app.caudals.com${path}`, {
    headers: {
      ...(cookie ? { cookie } : {}),
      "x-country-code": "US",
    },
  });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects anonymous admin root requests before DB-backed auth", async () => {
    const response = await proxy(request("/admin?module=settings"));
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location ?? "");
    expect(redirectUrl.pathname).toBe("/auth/sign-in");
    expect(redirectUrl.searchParams.get("next")).toBe(
      "/admin?module=settings"
    );
  });

  it("does not redirect authenticated admin root requests", async () => {
    const response = await proxy(
      request("/admin", "caudals.session_token=session_123")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps legacy admin subroutes hidden", async () => {
    const response = await proxy(request("/admin/requests"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });
});
