import { getLocale, t, tv, type MessageKey } from "@/lib/evals/messages/runtime";
import { formatMoney, humanize } from "./primitives";

/**
 * Small formatting helpers shared by the ops screens (launch R4): counts with
 * a singular, roles, provider adapters, prices per million tokens and the
 * entitlement changes recorded in an amendment.
 */

/** "1 active run" / "3 active runs": `one` is the singular sentence, `many` takes `{n}`. */
export function countOf(n: number, one: MessageKey, many: MessageKey): string {
  return n === 1 ? t(one) : tv(many, { n });
}

/** A workspace or platform role in the interface language. */
export function roleName(role: string): string {
  const key: Record<string, MessageKey> = { platform_admin: "platformAdmin", owner: "owner", editor: "editor", viewer: "viewer", operator: "operator" };
  return key[role] ? t(key[role]) : humanize(role);
}

/** How a model is reached. */
export function adapterLabel(adapter: string): string {
  return adapter === "dgx" ? "DGX Spark" : t("adapterOpenAiCompatible");
}

/** A provider price per token, read per million tokens ("€0.15 / €0.60 per 1M tokens"). */
export function perMillion(price: { input: string | number; output: string | number; currency: string }): string {
  const million = (value: string | number) => formatMoney(Number(value) * 1_000_000, price.currency);
  return tv("pricePerMillion", { input: million(price.input), output: million(price.output) });
}

/** The fields an amendment changed, with labels and readable values. */
export function amendmentText(next: Record<string, unknown>): string {
  const label: Record<string, MessageKey> = {
    max_active_runs: "maxActiveRunsLabel",
    monthly_spend_limit: "monthlyLimit",
    review_allowance: "reviewAllowance",
    can_schedule: "canSchedule",
    can_export: "canExport",
    allowed_connection_types: "allowedConnections",
    ceiling: "ceiling",
    commercial_cap: "ceiling",
  };
  return Object.entries(next)
    .filter(([key]) => key !== "currency" && key !== "version")
    .map(([key, value]) => {
      const name = label[key] ? t(label[key]) : humanize(key);
      const text = typeof value === "boolean" ? t(value ? "yesLabel" : "noLabel")
        : Array.isArray(value) ? value.map((item) => humanize(String(item))).join(", ")
          : (key === "monthly_spend_limit" || key === "ceiling" || key === "commercial_cap") && typeof next.currency === "string" ? formatMoney(value as string, next.currency)
            : String(value);
      return `${name}: ${text}`;
    })
    .join(" · ");
}

/** A whole percentage as each language writes it: "88%" in English, "88 %" in Spanish. */
export function percent(share: number): string {
  const value = Math.round(share * 100);
  return getLocale() === "es" ? `${value} %` : `${value}%`;
}
