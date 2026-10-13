"use client";

/**
 * The Settings tabs a person can open, shared by Settings and ⌘K (launch
 * L-22), and the per-device memory of the last tab a page showed (spec P-15:
 * "pages remember their last tab"). Storage is a per-device preference, like
 * the sidebar state: every read and write is best-effort.
 */
import { t } from "@/lib/evals/messages/en";

export type SettingsTab = "general" | "members" | "notifications" | "monitoring" | "developers" | "models" | "danger";

export function settingsTabs({ canManage, platformAdmin, owner }: { canManage: boolean; platformAdmin: boolean; owner: boolean }): Array<{ value: SettingsTab; label: string }> {
  return [
    { value: "general", label: t("general") },
    ...(canManage || platformAdmin ? [{ value: "members" as const, label: t("members") }] : []),
    { value: "notifications", label: t("notifications") },
    { value: "monitoring", label: t("monitoring") },
    { value: "developers", label: t("developers") },
    ...(platformAdmin ? [{ value: "models" as const, label: t("aiModels") }] : []),
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
