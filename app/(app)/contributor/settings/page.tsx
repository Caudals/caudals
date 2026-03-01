import { ContributorPageHeader } from "@/components/contributor/shared/contributor-page-header";
import { ContributorSettingsForm } from "@/components/contributor/settings/contributor-settings-form";
import { getContributorSettings } from "@/lib/actions/contributor-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ContributorSettingsPage() {
  const settingsRes = await getContributorSettings();

  return (
    <>
      <ContributorPageHeader title="Settings" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Contributor settings</h2>
          <p className="text-muted-foreground">
            Manage your contributor profile, availability, and notification preferences.
          </p>
        </div>

        {"error" in settingsRes ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-destructive">Unable to load settings</CardTitle>
            </CardHeader>
            <CardContent>{settingsRes.error}</CardContent>
          </Card>
        ) : (
          <ContributorSettingsForm initial={settingsRes.data} />
        )}
      </div>
    </>
  );
}
