import type { Metadata } from "next";
import { Header } from "@/components/ui/header";
import { getDatasets } from "@/lib/actions/dataset-actions";
import { BrowseClient } from "./browse-client";
import { MarketingFooter } from "@/components/marketing/footer";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Browse AI dataset requests",
  description:
    "Explore approved dataset opportunities and contributor-facing collection programs on Caudals.",
  pathname: "/browse",
});

export default async function BrowsePage() {
  const datasets = await getDatasets();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header translucent />
      <BrowseClient initialDatasets={datasets} />
      <MarketingFooter />
    </div>
  );
}
