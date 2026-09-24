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

/** A request to the public marketing host, where locale routing applies. */
function marketingRequest(
  path: string,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`https://caudals.com${path}`, { headers });
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

describe("proxy locale routing", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects an unprefixed public path to the negotiated locale", async () => {
    const response = await proxy(
      marketingRequest("/call", { "accept-language": "es-ES,es;q=0.9" }),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/es/call",
    );
  });

  it("temporarily redirects blog and newsletter requests to the home page", async () => {
    const blogResponse = await proxy(marketingRequest("/blog"));
    expect(blogResponse.status).toBe(307);
    expect(new URL(blogResponse.headers.get("location") ?? "").pathname).toBe("/");

    const localizedBlogResponse = await proxy(marketingRequest("/es/blog"));
    expect(localizedBlogResponse.status).toBe(307);
    expect(
      new URL(localizedBlogResponse.headers.get("location") ?? "").pathname,
    ).toBe("/es");

    const newsletterResponse = await proxy(marketingRequest("/newsletter"));
    expect(newsletterResponse.status).toBe(307);
    expect(
      new URL(newsletterResponse.headers.get("location") ?? "").pathname,
    ).toBe("/");

    const localizedNewsletterResponse = await proxy(
      marketingRequest("/es/newsletter"),
    );
    expect(localizedNewsletterResponse.status).toBe(307);
    expect(
      new URL(localizedNewsletterResponse.headers.get("location") ?? "").pathname,
    ).toBe("/es");
  });

  it("varies the redirect so shared caches do not mix visitors", async () => {
    const response = await proxy(marketingRequest("/"));
    expect(response.headers.get("vary")).toContain("accept-language");
    expect(response.headers.get("vary")).toContain("cookie");
  });

  it("keeps an explicit choice over a Spanish country hint", async () => {
    const response = await proxy(
      marketingRequest("/contact", {
        cookie: "NEXT_LOCALE=en",
        "x-country-code": "ES",
        "accept-language": "es-ES,es;q=0.9",
      }),
    );

    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/en/contact",
    );
  });

  it("serves a path that already carries a locale without redirecting", async () => {
    const response = await proxy(marketingRequest("/es/call"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers an unsupported language prefix with a 404", async () => {
    // Prefixing it would produce "/en/fr/blog"; a miss is the honest answer.
    const response = await proxy(marketingRequest("/fr/blog"));
    expect(response.status).toBe(404);
  });

  it("never locale-prefixes the internal or machine-readable surfaces", async () => {
    // AGENTS.md requires the public pages and the Operator Console to stay
    // strictly separate; locale routing must not reach across that line.
    for (const pathname of [
      "/api/newsletter",
      "/sitemap.xml",
      "/robots.txt",
      "/llms.txt",
    ]) {
      const response = await proxy(marketingRequest(pathname));
      expect(response.status, pathname).toBe(200);
      expect(response.headers.get("location"), pathname).toBeNull();
    }
  });
});
