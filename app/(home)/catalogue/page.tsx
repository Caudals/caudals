import { PublicCataloguePage } from "@/components/catalogue/public-catalogue-page";
import { getPublicCatalogueData } from "@/lib/catalogue/public-catalogue";
import { buildMarketingUrl, buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

type CataloguePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export const metadata = buildPublicMetadata({
  title: "Dataset catalogue | Caudals",
  description:
    "Browse curated AI-ready dataset listings with quality, licensing, privacy, freshness, and sample-preview evidence.",
  pathname: "/catalogue",
});

export default async function CataloguePage({
  searchParams,
}: CataloguePageProps) {
  const params = (await searchParams) ?? {};
  const data = await getPublicCatalogueData({
    query: firstSearchParam(params.q),
    modality: firstSearchParam(params.modality),
    licenseTier: firstSearchParam(params.licenseTier),
  });

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Caudals Dataset Catalogue",
    url: buildMarketingUrl("/catalogue"),
    description:
      "Curated AI-ready dataset listings with quality, licensing, privacy, freshness, and sample-preview evidence.",
    mainEntity: data.listings.map((listing) => ({
      "@type": "Dataset",
      name: listing.title,
      identifier: listing.id,
      url: buildMarketingUrl(`/catalogue?dataset=${listing.id}`),
      variableMeasured: listing.dataset.modality,
      license: listing.licenseTier,
      isAccessibleForFree: false,
      version: listing.version.label,
    })),
  };

  return (
    <>
      <PublicCataloguePage data={data} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </>
  );
}
