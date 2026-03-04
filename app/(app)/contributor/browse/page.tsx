import { ContributorPageHeader } from "@/components/contributor/shared/contributor-page-header";
import { getDatasets } from "@/lib/actions/dataset-actions";
import { ContributorBrowseClient } from "./contributor-browse-client";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function ContributorBrowsePage() {
  const datasets = await getDatasets();
  const t = await getServerTranslator();

  return (
    <div className="space-y-6">
      <ContributorPageHeader
        eyebrow={t("Discovery")}
        title={t("Browse opportunities")}
        description={t(
          "Find datasets that need your contributions. Filter by category, reward, or status."
        )}
        actions={
          <Button asChild variant="outline">
            <Link
              href="/contributor/contributions"
              data-dashboard-action="contributor_browse_open_contributions"
            >
              {t("My contributions")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />
      <ContributorBrowseClient initialDatasets={datasets} />
    </div>
  );
}
