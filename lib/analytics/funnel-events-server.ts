import "server-only";

import { generatePrefixedUlid } from "@/lib/db/ids";
import { queryRows } from "@/lib/db/client";
import type {
  FunnelEventName,
  FunnelEventPayload,
  ProductEventName,
  ProductEventPayload,
} from "@/lib/analytics/funnel-events";
import { logError, logWarn } from "@/lib/security/structured-logger";

declare global {
  var __caudalsAnalyticsIngestDisabledUntilMs: number | undefined;
  var __caudalsAnalyticsMissingTableLogged: boolean | undefined;
}

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

function isMissingAnalyticsTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = String((error as { code?: string }).code ?? "");
  return code === "42P01";
}

function isAnalyticsIngestTemporarilyDisabled() {
  return (
    typeof globalThis.__caudalsAnalyticsIngestDisabledUntilMs === "number" &&
    globalThis.__caudalsAnalyticsIngestDisabledUntilMs > Date.now()
  );
}

export async function recordProductEvent(input: RecordProductEventInput) {
  if (isAnalyticsIngestTemporarilyDisabled()) {
    return { skipped: true };
  }

  const metadata = sanitizePayload(input.payload);

  try {
    await queryRows(
      `
        INSERT INTO product_analytics_event (
          id,
          event_name,
          event_category,
          user_id,
          user_role,
          session_id,
          path,
          source,
          metadata,
          occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      `,
      [
        generatePrefixedUlid("pa"),
        input.eventName,
        resolveEventCategory(input.eventName),
        input.userId ?? null,
        input.userRole ?? null,
        input.sessionId ?? null,
        input.path ?? null,
        input.source,
        JSON.stringify(metadata),
        new Date().toISOString(),
      ]
    );
  } catch (error) {
    if (isMissingAnalyticsTableError(error)) {
      globalThis.__caudalsAnalyticsIngestDisabledUntilMs =
        Date.now() + 10 * 60 * 1000;
      if (!globalThis.__caudalsAnalyticsMissingTableLogged) {
        globalThis.__caudalsAnalyticsMissingTableLogged = true;
        logWarn("analytics.product_events_table_missing_ingest_paused", {
          error,
        });
      }
      return {
        skipped: true,
        error: error instanceof Error ? error.message : "analytics table missing",
      };
    }

    logError("analytics.record_funnel_event_failed", {
      event: input.eventName,
      error,
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to record analytics event",
    };
  }

  return { ok: true };
}

export async function recordFunnelEvent(input: RecordFunnelEventInput) {
  return recordProductEvent(input);
}
