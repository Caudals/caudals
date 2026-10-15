import type { MessagePath } from "@/lib/i18n/translate";
import type { SectorId } from "@/lib/public/sectors";

export type Verdict = "correct" | "invented" | "outdated" | "wrongSource" | "gap" | "outOfScope";

/**
 * One short conversation with an assistant per sector. The copy lives in
 * `heroChat.sectors.*`; this table holds only the verdict our check gives each
 * answer. The landing cycles through `LANDING_SECTORS`; each sector page shows
 * its own conversation.
 */
export const CONVERSATIONS = {
  telecom: [["t1", "outdated"], ["t2", "correct"], ["t3", "invented"]],
  legal: [["t1", "invented"], ["t2", "correct"], ["t3", "outOfScope"]],
  banking: [["t1", "gap"], ["t2", "correct"], ["t3", "outOfScope"]],
  energy: [["t1", "correct"], ["t2", "wrongSource"], ["t3", "outOfScope"]],
  insurance: [["t1", "invented"], ["t2", "correct"], ["t3", "outOfScope"]],
  industrial: [["t1", "wrongSource"], ["t2", "correct"], ["t3", "outOfScope"]],
  healthcare: [["t1", "invented"], ["t2", "correct"], ["t3", "outOfScope"]],
  travel: [["t1", "invented"], ["t2", "correct"], ["t3", "outOfScope"]],
} as const satisfies Record<SectorId, readonly (readonly ["t1" | "t2" | "t3", Verdict])[]>;

/** The landing's rotation, in order. */
export const LANDING_SECTORS: readonly SectorId[] = ["telecom", "legal", "banking", "energy", "insurance"];

/**
 * The messages `HeroChat` reads for these sectors: its labels and verdicts and
 * only the conversations it shows (launch L-24b). The server sends them with
 * `ClientMessages` next to the chat.
 */
export function heroChatMessages(sectors: readonly SectorId[] = LANDING_SECTORS): MessagePath[] {
  return [
    "heroChat.label",
    "heroChat.sectorsLabel",
    "heroChat.carousel",
    "heroChat.slide",
    "heroChat.show",
    "heroChat.source",
    "heroChat.verdicts",
    ...sectors.map((id) => `heroChat.sectors.${id}` as const),
  ];
}
