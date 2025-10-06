import { Header } from "@/components/ui/header";
import { getDatasets } from "@/lib/actions/dataset-actions";
import { BrowseClient } from "./browse-client";

export default async function BrowsePage() {
  const datasets = await getDatasets();

  return (
    <div className="min-h-screen bg-background">
      <Header links={[{ href: "/browse", label: "Browse" }]} />
      <BrowseClient initialDatasets={datasets} />
    </div>
  );
}
