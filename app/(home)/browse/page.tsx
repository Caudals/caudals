import { Header } from "@/components/ui/header";
import { getDatasets } from "@/lib/actions/dataset-actions";
import { BrowseClient } from "./browse-client";
import { MarketingFooter } from "@/components/marketing/footer";

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
