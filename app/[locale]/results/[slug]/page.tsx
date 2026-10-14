import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicResultsPage } from "@/components/public/results-page";
import { getScopedTranslator, resolveLocale } from "@/lib/i18n/server";
import { RESULTS_PATH } from "@/lib/publication/contracts";
import { publicResultsEnabled, publicResultsIndexed } from "@/lib/publication/flags";
import { getPublicResultPage } from "@/lib/publication/store";
import { buildNoIndexMetadata, buildPublicMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; slug: string }> };

// Read on every request (launch L-31): PUBLIC_RESULTS_ENABLED, and whether
// the owner's consent still stands. A withdrawn consent takes the page down
// on the next request.
export const dynamic = "force-dynamic";

/** One database read per request for the metadata and the page. */
const livePage = cache((slug: string) => getPublicResultPage(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  if (!publicResultsEnabled()) return buildNoIndexMetadata();
  const page = await livePage(slug);
  if (!page) return buildNoIndexMetadata();
  const t = getScopedTranslator(locale, "publicResults");
  const name = page.projection.public_name;
  return buildPublicMetadata({
    title: t("metaTitle", { name }),
    description: t("metaDescription", { name }),
    pathname: `${RESULTS_PATH}/${page.slug}`,
    locale,
    // noindex until the founder decides (PUBLIC_RESULTS_INDEXED).
    noIndex: !publicResultsIndexed(),
  });
}

/** An opt-in public results page (`/es/resultados/<slug>`), live only with the owner's standing consent. */
export default async function PublicResultsRoute({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  if (!publicResultsEnabled()) notFound();
  const page = await livePage(slug);
  if (!page) notFound();
  return <PublicResultsPage locale={locale} page={page} />;
}
