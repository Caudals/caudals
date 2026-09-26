/**
 * The sectors Caudals sells to, and the URL each one's page lives at.
 *
 * This module holds structure only — ids, order and slugs — so the proxy (edge)
 * can import it for routing. Page copy lives in `content/sectors/{locale}.json`
 * and short UI labels in the `sectors` message namespace.
 *
 * The ids match the `sector` options of the `/contact` form, so a sector page
 * can preselect its sector on the form it links to.
 */
import type { Locale } from "@/lib/i18n/config";

export const SECTOR_IDS = [
  "insurance",
  "industrial",
  "healthcare",
  "banking",
  "energy",
  "telecom",
  "legal",
  "travel",
] as const;

export type SectorId = (typeof SECTOR_IDS)[number];

/**
 * Public slug per locale. The English slug doubles as the internal route
 * parameter (`app/[locale]/sectors/[sector]`); the proxy rewrites every other
 * locale's slug to it.
 */
export const SECTOR_SLUGS: Record<SectorId, Record<Locale, string>> = {
  insurance: { en: "insurance", es: "seguros" },
  industrial: { en: "industrial-after-sales", es: "posventa-industrial" },
  healthcare: { en: "healthcare", es: "salud" },
  banking: { en: "banking", es: "banca" },
  energy: { en: "energy", es: "energia" },
  telecom: { en: "telecom", es: "telecomunicaciones" },
  legal: { en: "legal-and-advisory", es: "despachos-y-asesorias" },
  travel: { en: "travel", es: "viajes" },
};

/** Locale-free internal pathname of the sectors hub. */
export const SECTORS_HUB_PATH = "/sectors";

/** Public name of the hub segment per locale. */
export const SECTORS_HUB_SEGMENT: Record<Locale, string> = {
  en: "sectors",
  es: "sectores",
};

export function isSectorId(value: unknown): value is SectorId {
  return typeof value === "string" && (SECTOR_IDS as readonly string[]).includes(value);
}

/** Locale-free internal pathname of a sector page, e.g. `/sectors/insurance`. */
export function sectorPath(id: SectorId): string {
  return `${SECTORS_HUB_PATH}/${SECTOR_SLUGS[id].en}`;
}

/** Resolves the internal route parameter (the English slug) to a sector id. */
export function sectorIdFromRouteSlug(slug: string): SectorId | null {
  return SECTOR_IDS.find((id) => SECTOR_SLUGS[id].en === slug) ?? null;
}
