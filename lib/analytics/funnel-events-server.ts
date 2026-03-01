import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type {
  FunnelEventName,
  FunnelEventPayload,
  ProductEventName,
  ProductEventPayload,
} from "@/lib/analytics/funnel-events";
import { logError } from "@/lib/security/structured-logger";

type RecordFunnelEventInput = {
  eventName: FunnelEventName;
  userId?: string | null;
  userRole?: string | null;
  path?: string | null;
  sessionId?: string | null;
  source: "client" | "server";
  payload?: FunnelEventPayload;
};

type RecordProductEventInput = {
  eventName: ProductEventName;
  userId?: string | null;
  userRole?: string | null;
  path?: string | null;
  sessionId?: string | null;
  source: "client" | "server";
  payload?: ProductEventPayload;
};

function sanitizePayload(payload?: ProductEventPayload) {
  if (!payload) {
    return {};
  }

  return Object.entries(payload).reduce<Record<string, string | number | boolean | null>>(
    (acc, [key, value]) => {
      if (value === undefined) {
        return acc;
      }
      if (!key || key.length > 80) {
        return acc;
      }
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );
}

function resolveEventCategory(eventName: ProductEventName) {
  if (eventName.startsWith("funnel_")) {
    return "funnel";
  }
  if (eventName.startsWith("dashboard_")) {
    return "dashboard";
  }
  return "product";
}

export async function recordProductEvent(input: RecordProductEventInput) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Analytics disabled: missing Supabase admin credentials." };
  }

  let adminClient: any;
  try {
    adminClient = createAdminClient("analytics_ingest");
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Analytics disabled: could not initialize admin client.",
    };
  }

  const metadata = sanitizePayload(input.payload);

  const { error } = await adminClient.from("product_analytics_events").insert({
    event_name: input.eventName,
    event_category: resolveEventCategory(input.eventName),
    user_id: input.userId ?? null,
    user_role: input.userRole ?? null,
    session_id: input.sessionId ?? null,
    path: input.path ?? null,
    source: input.source,
    metadata: metadata as Json,
    occurred_at: new Date().toISOString(),
  });

  if (error) {
    logError("analytics.record_funnel_event_failed", {
      event: input.eventName,
      error,
    });
    return { error: error.message };
  }

  return { ok: true };
}

export async function recordFunnelEvent(input: RecordFunnelEventInput) {
  return recordProductEvent(input);
}
