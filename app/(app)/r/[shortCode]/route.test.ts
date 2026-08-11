import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("first-party attribution redirect", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves a stable link and carries only opaque journey ids to the landing page", async () => {
    const eventId = "11111111-1111-4111-8111-111111111111";
    const visitorId = "22222222-2222-4222-8222-222222222222";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      event_id: eventId,
      visitor_id: visitorId,
      destination_url: "https://caudals.com/contact?utm_source=linkedin&utm_campaign=launch",
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const response = await GET(
      new NextRequest("https://caudals.com/r/content-link-123", {
        headers: { referer: "https://linkedin.com/" },
      }),
      { params: Promise.resolve({ shortCode: "content-link-123" }) },
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://caudals.com/contact");
    expect(location.searchParams.get("utm_campaign")).toBe("launch");
    expect(location.searchParams.get("caudals_attribution")).toBe(
      `${eventId}.${visitorId}.content-link-123`,
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("uses the trusted forwarded public origin when an invalid code reaches Next through the proxy", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/r/bad", {
        headers: {
          host: "localhost:3000",
          "x-forwarded-host": "caudals.com",
          "x-forwarded-proto": "https",
        },
      }),
      { params: Promise.resolve({ shortCode: "bad" }) },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://caudals.com/");
  });

  it("never trusts an arbitrary forwarded host for fallback redirects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const response = await GET(
      new NextRequest("http://localhost:3000/r/content-link-123", {
        headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" },
      }),
      { params: Promise.resolve({ shortCode: "content-link-123" }) },
    );

    expect(response.headers.get("location")).toBe("https://caudals.com/");
  });
});
