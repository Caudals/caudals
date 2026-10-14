/**
 * The customer-facing API contract (WP-13, documented in launch L-20): token
 * scopes, the read endpoints and their fields, webhook events and limits.
 * Client-safe. The routes, the token and webhook code and the API reference
 * in Settings → Developers all read these constants, so the reference cannot
 * drift from what the routes accept and return.
 */

export const CUSTOMER_TOKEN_SCOPES = ["runs:read", "reports:read", "schedules:read", "runs:write"] as const;
export type CustomerScope = (typeof CUSTOMER_TOKEN_SCOPES)[number];
/** The read scopes (WP-13). `runs:write` (launch L-19) is offered only with INTEGRATIONS_V2_ENABLED. */
export const READ_TOKEN_SCOPES = ["runs:read", "reports:read", "schedules:read"] as const satisfies readonly CustomerScope[];

/** `GET /api/evals/v1/integrations/{resource}?orgId=…` and the scope each needs. */
export const CUSTOMER_API_RESOURCES = { runs: "runs:read", reports: "reports:read", schedules: "schedules:read" } as const satisfies Record<string, (typeof READ_TOKEN_SCOPES)[number]>;
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

/**
 * CI trigger (launch L-19, spec v2 P-27). `POST /api/evals/v1/integrations/runs?orgId=…`
 * (runs:write, `Idempotency-Key` required) starts one run of an evaluation's
 * approved test set version on a system version and answers with these fields;
 * the same key always answers with the same run (`replayed: true`).
 */
export const CI_RUN_INPUT_FIELDS = ["suiteVersionId", "targetRevisionId", "evaluationId"] as const;
export const CI_RUN_FIELDS = ["run_id", "evaluation_id", "suite_version_id", "target_revision_id", "status", "replayed", "gate_url"] as const;
/**
 * `GET /api/evals/v1/integrations/runs/{runId}/gate?orgId=…` (runs:read or runs:write):
 * `pass` or `fail` against the pass threshold set on the schedule or the test
 * set, `unknown` when the run could not give a result (it failed, was
 * cancelled or paused, too few answers were graded, or no threshold is set),
 * `pending` while it runs or is being graded.
 */
export const GATE_STATUSES = ["pass", "fail", "unknown", "pending"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];
export const GATE_FIELDS = ["run_id", "status", "score", "threshold", "threshold_source", "run_status", "reason_codes", "report_id"] as const;

/**
 * Where scheduled-run summaries go (launch L-19, P-28): Slack and Microsoft
 * Teams incoming webhooks (readable messages with links), an email address,
 * or the generic signed webhook (unchanged).
 */
export const DESTINATION_TYPES = ["slack", "teams", "email", "webhook"] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];

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
  /** Runs the API may start per workspace and hour (launch L-19); replays of a key do not count. */
  runStartsPerHour: 30,
  /** `runs:write` tokens are short-lived: at most this many days. */
  writeTokenMaxDays: 90,
  /** Test messages per destination and hour. */
  destinationTestsPerHour: 5,
  /** Live destinations per workspace. */
  destinationsPerWorkspace: 20,
} as const;
