import { deterministicPrefixedId } from "@/lib/auth/supabase-auth-migration";

const waitlistStatuses = new Set([
  "pending",
  "contacted",
  "qualified",
  "converted",
]);
const analyticsCategories = new Set(["funnel", "dashboard", "product"]);
const analyticsSources = new Set(["client", "server"]);
const stripeProcessingStates = new Set(["processing", "processed", "failed"]);

export type LegacyWaitlistSignupRow = {
  id: string;
  fullName: string | null;
  email: string;
  company: string | null;
  useCase: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  lastNotifiedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type MigratedWaitlistSignup = {
  id: string;
  fullName: string | null;
  email: string;
  company: string | null;
  useCase: string | null;
  status: string;
  metadata: Record<string, unknown>;
  lastNotifiedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type LegacyProductAnalyticsEventRow = {
  id: string;
  eventName: string;
  eventCategory: string;
  userId: string | null;
  userRole: string | null;
  sessionId: string | null;
  path: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  occurredAt: Date | string;
  createdAt: Date | string;
};

export type MigratedProductAnalyticsEvent = {
  id: string;
  eventName: string;
  eventCategory: string;
  userId: string | null;
  userRole: string | null;
  sessionId: string | null;
  path: string | null;
  source: string;
  metadata: Record<string, unknown>;
  occurredAt: Date | string;
  createdAt: Date | string;
};

export type LegacyStripeWebhookEventRow = {
  stripeEventId: string;
  eventType: string;
  processingState: string;
  payload: Record<string, unknown> | null;
  receivedAt: Date | string;
  processedAt: Date | string | null;
  lastError: string | null;
};

export type MigratedStripeWebhookEvent = LegacyStripeWebhookEventRow & {
  payload: Record<string, unknown>;
};

export type LegacyAbuseRateLimitRow = {
  key: string;
  count: number;
  resetAt: Date | string;
  updatedAt: Date | string;
};

export type MigratedAbuseRateLimit = LegacyAbuseRateLimitRow;

function normalizeMetadata(value: Record<string, unknown> | null) {
  return value ?? {};
}

export function mapLegacyWaitlistSignup(
  row: LegacyWaitlistSignupRow
): MigratedWaitlistSignup {
  return {
    id: deterministicPrefixedId("wl", `legacy_waitlist_signup:${row.id}`),
    fullName: row.fullName,
    email: row.email.trim().toLowerCase(),
    company: row.company,
    useCase: row.useCase,
    status: waitlistStatuses.has(row.status) ? row.status : "pending",
    metadata: normalizeMetadata(row.metadata),
    lastNotifiedAt: row.lastNotifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapLegacyProductAnalyticsEvent(
  row: LegacyProductAnalyticsEventRow
): MigratedProductAnalyticsEvent {
  return {
    id: deterministicPrefixedId(
      "pa",
      `legacy_product_analytics_event:${row.id}`
    ),
    eventName: row.eventName,
    eventCategory: analyticsCategories.has(row.eventCategory)
      ? row.eventCategory
      : "funnel",
    userId: row.userId,
    userRole: row.userRole,
    sessionId: row.sessionId,
    path: row.path,
    source: analyticsSources.has(row.source) ? row.source : "server",
    metadata: normalizeMetadata(row.metadata),
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

export function mapLegacyStripeWebhookEvent(
  row: LegacyStripeWebhookEventRow
): MigratedStripeWebhookEvent {
  return {
    ...row,
    processingState: stripeProcessingStates.has(row.processingState)
      ? row.processingState
      : "failed",
    payload: normalizeMetadata(row.payload),
  };
}

export function mapLegacyAbuseRateLimit(
  row: LegacyAbuseRateLimitRow
): MigratedAbuseRateLimit {
  return row;
}
