import en from "@/content/sectors/en.json";
import es from "@/content/sectors/es.json";
import type { Locale } from "@/lib/i18n/config";
import { getScopedTranslator } from "@/lib/i18n/server";
import type { SectorId } from "@/lib/public/sectors";

/**
 * Sector page copy, one file per locale.
 *
 * Each sector page is long-form marketing prose — failure examples, FAQs,
 * expert roles — so it lives in `content/sectors/` beside the legal documents
 * rather than in the UI message files. `en.json` defines the shape and
 * `es.json` is checked against it, so a field missing in one language is a
 * type error.
 */

/** The five ways an assistant gets an answer wrong, as the landing names them. */
export type FailureCause = "invented" | "outdated" | "wrongSource" | "gap" | "outOfScope";

export type FailureExample = { q: string; a: string; doc: string; src: string };

/** Icons an expert role may use; `components/sectors/expert-icons.tsx` maps them. */
export type ExpertRoleIcon =
  | "adjuster"
  | "claims"
  | "calculator"
  | "handshake"
  | "wrench"
  | "cog"
  | "stethoscope"
  | "heart"
  | "calendar"
  | "bank"
  | "shield"
  | "zap"
  | "receipt"
  | "headset"
  | "router"
  | "scale"
  | "briefcase"
  | "plane";

/** Kinds of data our experts build; they share the landing's glyphs. */
export type DatasetKind = "exams" | "qa" | "docs" | "reasoning" | "preferences";

/**
 * A sector's page copy. Its short name is UI copy shared with the header and
 * footer, so it lives in the `sectors.names` messages and is merged in here.
 */
export type SectorCopy = {
  name: string;
  metaTitle: string;
  metaDescription: string;
  /** Hero headline; one word is marked `*like this*` for the serif italic. */
  headline: string;
  subtitle: string;
  /** One sentence for the hub card and link lists. */
  summary: string;
  audience: string;
  stakes: { lead: string; solution: string };
  tested: {
    title: string;
    description: string;
    systems: readonly string[];
    topics: readonly string[];
  };
  failures: {
    title: string;
    description: string;
    examples: Record<FailureCause, FailureExample>;
  };
  experts: {
    title: string;
    description: string;
    roles: readonly { label: string; icon: ExpertRoleIcon }[];
    datasets: readonly { kind: DatasetKind; name: string; description: string }[];
  };
  faq: readonly { q: string; a: string }[];
};

type SectorContent = Record<SectorId, Omit<SectorCopy, "name">>;

const content: Record<Locale, SectorContent> = {
  en: en as SectorContent,
  es: (es satisfies typeof en) as SectorContent,
};

export function getSectorCopy(id: SectorId, locale: Locale): SectorCopy {
  return { ...content[locale][id], name: getScopedTranslator(locale, "sectors")(`names.${id}`) };
}
