/**
 * Bring your own provider key (BYOK, launch L-27, spec v2 §6.11): the parts
 * the browser, the web process and the workers share. No secrets here.
 */

/** The providers a workspace can connect, at fixed OpenAI-compatible base addresses (migration 102, evals.byok_endpoint). */
export const BYOK_PROVIDERS = ["openai", "anthropic", "google", "mistral", "openrouter"] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];
export const BYOK_PROVIDER_LABELS: Record<ByokProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  mistral: "Mistral",
  openrouter: "OpenRouter",
};
export const BYOK_ENDPOINTS: Record<ByokProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

/** The engine roles a workspace key can serve. */
export const BYOK_ROLES = ["context_analyzer", "generator", "judge", "report_writer"] as const;
export type ByokRole = (typeof BYOK_ROLES)[number];

/** A key's last known state: from the check when it was saved, then from real calls. */
export type ByokKeyState = "valid" | "quota_exceeded" | "invalid";

/**
 * Why work on a workspace key stopped. Shown as "Your provider key failed:
 * <reason>" with a link to Settings → AI models. The work pauses and never
 * moves to a Caudals key (invariant INV-11).
 */
export const CUSTOMER_KEY_REASONS = [
  "customer_key_invalid",
  "customer_key_quota",
  "customer_key_revoked",
  "customer_key_model",
  "customer_key_rate_limited",
  "customer_key_unavailable",
  "customer_key_rejected",
] as const;
export type CustomerKeyReason = (typeof CUSTOMER_KEY_REASONS)[number];

export function isCustomerKeyReason(value: unknown): value is CustomerKeyReason {
  return typeof value === "string" && (CUSTOMER_KEY_REASONS as readonly string[]).includes(value);
}

/** Reasons a replaced key can clear: work paused for them resumes after a successful save. */
export const RESUMABLE_KEY_REASONS: readonly CustomerKeyReason[] = CUSTOMER_KEY_REASONS.filter((reason) => reason !== "customer_key_revoked");
export function isResumableKeyReason(value: unknown): value is CustomerKeyReason {
  return isCustomerKeyReason(value) && value !== "customer_key_revoked";
}

/** Where an owner fixes a failing key. */
export const BYOK_FIX_PATH = "/workspace/settings?tab=models";
