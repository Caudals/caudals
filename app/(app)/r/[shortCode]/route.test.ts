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
});
