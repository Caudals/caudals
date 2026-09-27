import type { Translator } from "@/lib/i18n/messages";

/**
 * The home page FAQ, in reading order. Copy lives in `lib/i18n/messages/*.json`
 * under `faq`; the landing, its FAQPage structured data and the markdown served
 * to agents all read this list, so the three cannot disagree.
 */
export const HOME_FAQ_IDS = [
  "what",
  "systems",
  "access",
  "cost",
  "private",
] as const;

export type HomeFaqId = (typeof HOME_FAQ_IDS)[number];

export function homeFaqItems(t: Translator) {
  return HOME_FAQ_IDS.map((id) => ({ q: t(`faq.${id}.q`), a: t(`faq.${id}.a`) }));
}
