import "server-only";
import { logWarn } from "@/lib/security/structured-logger";

type ConversionInput = {
  parentEventId: string;
  visitorId: string;
  shortCode: string;
  landingUrl: string | null;
  referrerUrl: string | null;
  eventName: string;
};

function attributionApiBase() {
  return (process.env.LEADS_ATTRIBUTION_API_URL ??
    "https://leads.caudals.com/api/attribution/public").replace(/\/$/, "");
}

export async function recordAttributionConversion(input: ConversionInput) {
  try {
    const response = await fetch(`${attributionApiBase()}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        event_type: "conversion",
        parent_event_id: input.parentEventId,
        visitor_id: input.visitorId,
        short_code: input.shortCode,
        landing_url: input.landingUrl,
        referrer_url: input.referrerUrl,
        landing_context: { product_event: input.eventName, source: "caudals_public_site" },
      }),
    });
    if (!response.ok) {
      logWarn("attribution.conversion_rejected", { status: response.status, event: input.eventName });
    }
  } catch (error) {
    logWarn("attribution.conversion_failed", { error, event: input.eventName });
  }
}
