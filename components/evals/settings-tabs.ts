"use client";

/**
 * The Settings tabs a person can open, shared by Settings and ⌘K (launch
 * L-22), and the per-device memory of the last tab a page showed (spec P-15:
 * "pages remember their last tab"). Storage is a per-device preference, like
 * the sidebar state: every read and write is best-effort.
 */
import { t } from "@/lib/evals/messages/runtime";

export type SettingsTab = "general" | "billing" | "members" | "notifications" | "monitoring" | "developers" | "models" | "data" | "danger";

/**
 * `billing`: Billing and usage shows for this person and workspace (launch L-15; owners and editors where billing is on).
 * `models`: AI models shows to an owner whose workspace may use its own provider keys (launch L-27); platform admins always see it.
 * `data`: answer retention and "Export all workspace data" (launch L-32, DATA_CONTROLS_ENABLED); every member sees it, owners act.
 */
export function settingsTabs({ canManage, platformAdmin, owner, billing = false, models = false, data = false }: { canManage: boolean; platformAdmin: boolean; owner: boolean; billing?: boolean; models?: boolean; data?: boolean }): Array<{ value: SettingsTab; label: string }> {
  return [
    { value: "general", label: t("general") },
    ...(billing ? [{ value: "billing" as const, label: t("billingAndUsage") }] : []),
    ...(canManage || platformAdmin ? [{ value: "members" as const, label: t("members") }] : []),
    { value: "notifications", label: t("notifications") },
    { value: "monitoring", label: t("monitoring") },
    { value: "developers", label: t("developers") },
    ...(platformAdmin || models ? [{ value: "models" as const, label: t("aiModels") }] : []),
    ...(data ? [{ value: "data" as const, label: t("dataTab") }] : []),
    ...(owner || platformAdmin ? [{ value: "danger" as const, label: t("dangerZone") }] : []),
  ];
}

const key = (page: string) => `caudals.tab.${page}`;

/** The tab this device last showed on `page` ("settings", "report"), or null. */
export function rememberedTab(page: string): string | null {
  try {
    return window.localStorage.getItem(key(page));
  } catch {
    return null;
  }
}

export function rememberTab(page: string, value: string) {
  try {
    window.localStorage.setItem(key(page), value);
  } catch {
    /* preference is best-effort */
  }
}
