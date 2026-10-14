/** Canonical v2 catalogue. A name has one ingestion source, never both. */
export const CLIENT_EVENT_NAMES = ["page_view", "demo_viewed", "pilot_requested", "readout_link_clicked", "expert_review_requested", "example_viewed"] as const;
export const SERVER_EVENT_NAMES = ["demo_started", "demo_finished", "demo_signup_requested", "demo_report_shared", "account_created", "evaluation_created", "test_set_ready", "run_started", "run_finished", "report_viewed", "report_shared", "export_downloaded", "limit_hit", "schedule_created", "api_token_created", "webhook_created", "sources_added", "scan_detected", "context_confirmed", "readout_presented", "readout_exported", "report_question_asked", "top_up_started", "top_up_paid", "auto_recharge_paid", "auto_recharge_failed"] as const;
export type ClientEventName = typeof CLIENT_EVENT_NAMES[number];
export type ServerEventName = typeof SERVER_EVENT_NAMES[number];
export type ProductEventName = ClientEventName | ServerEventName;
export type ProductEventPayload = Record<string, string | number | boolean | null | undefined>;

const properties: Record<ProductEventName, readonly string[]> = {
  page_view: ["locale", "referrer"], demo_viewed: ["locale"],
  demo_started: ["target_kind", "docs_given", "locale", "queue_wait_s"],
  demo_finished: ["outcome", "error_code", "duration_s", "scored", "correct", "model_used", "target_kind", "locale", "fallback_cost_eur"],
  demo_signup_requested: [], demo_report_shared: ["channel", "consent"], account_created: ["acquisition", "plan"],
  evaluation_created: ["connection_kind"], test_set_ready: ["question_count", "duration_s"],
  run_started: ["questions", "models", "estimate"], run_finished: ["questions", "models", "estimate", "credits_charged", "outcome", "duration_s"],
  report_viewed: ["first_view"], report_shared: ["scope"], export_downloaded: ["format"], limit_hit: ["kind"],
  expert_review_requested: ["surface"], pilot_requested: ["surface"], readout_link_clicked: ["surface"], example_viewed: ["surface"],
  schedule_created: ["destination_type"], api_token_created: ["destination_type"], webhook_created: ["destination_type"],
  sources_added: ["source_kind", "count"], scan_detected: ["source_kind", "count"], context_confirmed: ["count", "edited_fields"],
  readout_presented: ["revision_hash", "slide_count"], readout_exported: ["revision_hash", "slide_count"], report_question_asked: ["outcome", "credits"],
  top_up_started: ["pack", "net_amount", "first_purchase"], top_up_paid: ["pack", "net_amount", "first_purchase"],
  auto_recharge_paid: ["pack", "net_amount", "first_purchase"], auto_recharge_failed: ["pack", "net_amount", "reason"],
};
export const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "partner", "attribution_parent_event_id", "attribution_visitor_id", "attribution_short_code"] as const;
export type Attribution = Partial<Record<typeof ATTRIBUTION_KEYS[number], string>>;
/** Campaign labels, never arbitrary text, full URLs, email, IPs or escaped values. */
export function safeLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,119}$/.test(value)) return;
  if (/https?:|@|\b(?:\d{1,3}\.){3}\d{1,3}\b|\[|%|::|(?:[a-f0-9]{1,4}:){2,}/i.test(value)) return;
  return value;
}
export function sanitizeAttribution(value: unknown): Attribution {
  const result: Attribution = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const key of ATTRIBUTION_KEYS) {
    const label = safeLabel((value as Record<string, unknown>)[key]);
    if (!label) continue;
    if (key.endsWith("_id") && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(label)) continue;
    result[key] = label;
  }
  return result;
}
export function sanitizePayload(event: ProductEventName, payload?: ProductEventPayload) {
  const result: Record<string, string | number | boolean | null> = {};
  for (const key of properties[event] ?? []) {
    const value = payload?.[key];
    if (value === null || typeof value === "boolean") result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e12) result[key] = value;
    else { const label = safeLabel(value); if (label) result[key] = label; }
  }
  return result;
}
/** Route templates only: remove query strings and any user-controlled slug/token. */
export function analyticsPath(path?: string | null): string | null {
  if (!path?.startsWith("/") || path.startsWith("//")) return null;
  const known = new Set("en es demo workspace ops review evaluations systems reports test-sets settings billing usage growth clients library platform sources signup sign-in legal privacy terms cookies dpa subprocessors security notice contact call blog sectors methodology example sample-report informe-de-ejemplo exports share fixes".split(" "));
  return path.split(/[?#]/, 1)[0].split("/").slice(0, 8).map(part => !part || known.has(part) ? part : ":id").join("/");
}
