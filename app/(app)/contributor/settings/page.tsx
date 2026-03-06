import { ContributorPageHeader } from "@/components/contributor/shared/contributor-page-header";
import { ContributorSettingsForm } from "@/components/contributor/settings/contributor-settings-form";
import { getContributorSettings } from "@/lib/actions/contributor-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function ContributorSettingsPage() {
  const settingsRes = await getContributorSettings();

  return (
    <div className="space-y-6">
      <ContributorPageHeader
        title="Contributor settings"
        description="Configure profile trust signals, availability, focus areas, and notification preferences."
        actions={
          <Button asChild variant="outline">
            <Link
              href="/contributor/earnings"
              data-dashboard-action="contributor_settings_open_earnings"
            >
              View earnings
            </Link>
          </Button>
        }
      />

      {"error" in settingsRes ? (
        <Card className="shadow-sm bg-white border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">
              Unable to load settings
            </CardTitle>
          </CardHeader>
          <CardContent>{settingsRes.error}</CardContent>
        </Card>
      ) : (
        <ContributorSettingsForm initial={settingsRes.data} />
      )}
    </div>
  );
}
