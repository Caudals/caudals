import { t, type MessageKey } from "@/lib/evals/messages/runtime";
import { codeText } from "./primitives";

/**
 * Why a public demo stopped, as an operator reads it (ops overview and
 * growth). The codes come from `lib/demo/runner.ts`, `lib/demo/web.ts` and the
 * browser worker; an unknown code shows as itself (launch R4).
 */
const REASON: Record<string, MessageKey> = {
  site_unreachable: "demoReasonSiteUnreachable",
  site_blocked: "demoReasonSiteBlocked",
  site_not_html: "demoReasonSiteNotHtml",
  site_empty: "demoReasonSiteEmpty",
  site_thin: "demoReasonSiteThin",
  site_unreadable: "demoReasonSiteUnreadable",
  destination_denied: "demoReasonDestination",
  destination_invalid: "demoReasonDestination",
  chat_not_found: "demoReasonChatNotFound",
  login_required: "demoReasonLoginRequired",
  generation_failed: "demoReasonGenerationFailed",
  model: "demoReasonModel",
  capacity: "demoReasonCapacity",
  capacity_run: "demoReasonCapacity",
  interrupted: "demoReasonInterrupted",
  expired: "demoReasonExpired",
  target_auth: "demoReasonTargetAuth",
  target_not_found: "demoReasonTargetNotFound",
  target_rate_limited: "demoReasonTargetRateLimited",
  target_http: "demoReasonTargetHttp",
  target_shape: "demoReasonTargetShape",
  target_unreachable: "demoReasonTargetUnreachable",
};

export function demoReason(code: string | null | undefined): string {
  if (!code || code === "none") return "—";
  if (code.startsWith("timeout_")) return t("demoReasonTimeout");
  const key = REASON[code];
  return key ? t(key) : codeText(code);
}
