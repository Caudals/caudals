/**
 * The customer-facing API contract (WP-13, documented in launch L-20): token
 * scopes, the read endpoints and their fields, webhook events and limits.
 * Client-safe. The routes, the token and webhook code and the API reference
 * in Settings → Developers all read these constants, so the reference cannot
 * drift from what the routes accept and return.
 */

export const CUSTOMER_TOKEN_SCOPES = ["runs:read", "reports:read", "schedules:read"] as const;
export type CustomerScope = (typeof CUSTOMER_TOKEN_SCOPES)[number];

/** `GET /api/evals/v1/integrations/{resource}?orgId=…` and the scope each needs. */
export const CUSTOMER_API_RESOURCES = { runs: "runs:read", reports: "reports:read", schedules: "schedules:read" } as const satisfies Record<string, CustomerScope>;
export type CustomerResource = keyof typeof CUSTOMER_API_RESOURCES;

/** Columns each list returns, newest first. */
export const CUSTOMER_API_FIELDS = {
  runs: ["id", "evaluation_id", "target_revision_id", "suite_version_id", "status", "phase", "reason_code", "created_at", "updated_at"],
  reports: ["id", "title", "current_revision_id", "updated_at"],
  schedules: ["id", "evaluation_id", "target_revision_id", "suite_version_id", "status", "next_due_at", "timezone", "cadence", "local_time", "weekday", "day_of_month", "version"],
} as const satisfies Record<CustomerResource, readonly string[]>;

/** `GET /api/evals/v1/integrations/ci/{scheduleId}?orgId=…` (runs:read): the latest scheduled outcome. */
export const CI_STATUS_FIELDS = ["schedule_id", "dispatch_id", "scheduled_for", "run_id", "status", "reason_codes"] as const;
export const CI_STATUSES = ["pass", "regression", "inconclusive", "unknown", "pending"] as const;

/** Events a webhook endpoint can receive; all are sent after a scheduled run is judged. */
export const WEBHOOK_EVENT_KINDS = ["run_completed", "run_partial", "run_unknown", "regression", "inconclusive"] as const;
export type WebhookEventKind = (typeof WEBHOOK_EVENT_KINDS)[number];
/** Fields of a webhook body besides `event_id` and `event_kind` (lib/evals/monitoring/alerts.ts). */
export const WEBHOOK_PAYLOAD_FIELDS = ["alert_id", "dispatch_id", "run_id", "baseline_run_id", "status", "reason_codes"] as const;
export const WEBHOOK_HEADERS = { id: "x-caudals-delivery-id", timestamp: "x-caudals-timestamp", signature: "x-caudals-signature" } as const;

export const CUSTOMER_API_LIMITS = {
  /** Requests per token per window, across every token endpoint. */
  requestsPerWindow: 60,
  windowSeconds: 60,
  /** Items returned by each list (no pagination). */
  listItems: 100,
  /** Token lifetime bounds. */
  tokenMinMinutes: 5,
  tokenMaxDays: 366,
  /** Webhook delivery: attempts, wait before each retry (minutes), timeout and signature clock window. */
  webhookAttempts: 5,
  webhookRetryMinutes: [1, 2, 4, 8],
  webhookTimeoutSeconds: 10,
  signatureWindowSeconds: 300,
} as const;
