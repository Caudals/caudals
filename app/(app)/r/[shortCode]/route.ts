import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const CODE = /^[a-z0-9_-]{6,32}$/i;

type Resolution = {
  event_id: string;
  visitor_id: string;
  destination_url: string;
};

function attributionApiBase() {
  return (process.env.LEADS_ATTRIBUTION_API_URL ??
    "https://leads.caudals.com/api/attribution/public").replace(/\/$/, "");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await context.params;
  if (!CODE.test(shortCode)) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  const visitorId = randomUUID();
  const endpoint = new URL(`${attributionApiBase()}/resolve/${encodeURIComponent(shortCode)}`);
  endpoint.searchParams.set("visitor_id", visitorId);
  endpoint.searchParams.set("referrer", request.headers.get("referer") ?? "");
  endpoint.searchParams.set("landing_url", request.url);
  endpoint.searchParams.set("context", "caudals_public_site");

  const resolved = await fetch(endpoint, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) return null;
    return response.json() as Promise<Resolution>;
  }).catch(() => null);

  if (!resolved?.event_id || !resolved.destination_url) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  const destination = new URL(resolved.destination_url);
  destination.searchParams.set(
    "caudals_attribution",
    `${resolved.event_id}.${resolved.visitor_id}.${shortCode}`,
  );
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
