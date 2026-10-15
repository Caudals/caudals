/**
 * Share links as the owner manages them (launch L-17 and P-54): the row the
 * share list returns, the lifetimes offered, and how often a link was opened.
 * The report's share dialog and the vendor fix-list dialog both use them.
 */
import { formatDate } from "./primitives";
import { t, tv } from "@/lib/evals/messages/runtime";
import { shareScope } from "@/lib/evals/reports/share-sections";

/** `open_count` and `last_opened_at` count page opens only (launch L-17); `access_count` also counts downloads. */
export type ShareLink = { id: string; report_revision_id: string; audience: string; recipient: string | null; permitted_fields: string[]; expires_at: string; revoked_at: string | null; access_count: number; open_count?: number; last_opened_at?: string | null };
/** Link lifetimes offered when sharing (spec P-21). */
export const SHARE_EXPIRY_PRESETS = [7, 30, 90] as const;
export type ShareExpiry = (typeof SHARE_EXPIRY_PRESETS)[number];

/** A vendor's fix-list link (launch P-54) rather than a report share. */
export const isFixListLink = (share: Pick<ShareLink, "permitted_fields">) => shareScope(share.permitted_fields ?? []) === "fix_list";

/** "Opened 3 times, last on 12 Oct 2026" for the owner (spec P-21), from the share's access log. */
export function openedLabel(share: ShareLink) {
  const count = share.open_count ?? share.access_count;
  if (!count) return t("shareNotOpened");
  const date = share.last_opened_at ? formatDate(share.last_opened_at) : "—";
  return count === 1 ? tv("shareOpenedOnce", { date }) : tv("shareOpenedMany", { count, date });
}
