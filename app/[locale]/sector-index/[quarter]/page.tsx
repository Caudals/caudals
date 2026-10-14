import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SectorIndexPage } from "@/components/public/sector-index-page";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { quarterFromParam, quarterParam, SECTOR_INDEX_PATH } from "@/lib/publication/contracts";
import { publicResultsEnabled, publicResultsIndexed } from "@/lib/publication/flags";
import { quarterParts } from "@/lib/publication/format";
import { getPublicSectorIndex } from "@/lib/publication/store";
import { buildNoIndexMetadata, buildPublicMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; quarter: string }> };

// Read on every request (launch L-31): PUBLIC_RESULTS_ENABLED and the live,
// signed-off editions of the quarter.
export const dynamic = "force-dynamic";

const liveIndex = cache((quarter: string) => getPublicSectorIndex(quarter));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, quarter: param } = await params;
  const locale = resolveLocale(raw);
  const quarter = quarterFromParam(param);
  if (!publicResultsEnabled() || !quarter) return buildNoIndexMetadata();
  const index = await liveIndex(quarter);
  if (!index) return buildNoIndexMetadata();
  const t = getScopedTranslator(locale, "sectorIndex");
  const label = t("quarter", quarterParts(quarter));
  return buildPublicMetadata({
    title: t("metaTitle", { quarter: label }),
    description: t("metaDescription", { quarter: label }),
    pathname: `${SECTOR_INDEX_PATH}/${quarterParam(quarter)}`,
    locale,
    noIndex: !publicResultsIndexed(),
  });
}

/** One quarter of the anonymous sector index (`/es/indice-sectorial/2026-q4`): signed-off sectors of ten systems or more. */
export default async function SectorIndexRoute({ params }: Props) {
  const { locale: raw, quarter: param } = await params;
  const locale = resolveLocale(raw);
  const quarter = quarterFromParam(param);
  if (!publicResultsEnabled() || !quarter) notFound();
  const index = await liveIndex(quarter);
  if (!index) notFound();
  return <SectorIndexPage locale={locale} index={index} />;
}
