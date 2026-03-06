import { getProfile } from "@/lib/actions/profile-actions";
import { getOrgSettings, getRequesterApiKeys } from "@/lib/actions/requester-actions";
import { ProfileForm, ProfileData } from "@/components/requester/settings/profile-form";
import { OrgForm, OrgSettings } from "@/components/requester/settings/org-form";
import { ApiKeysCard, ApiKey } from "@/components/requester/settings/api-keys-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function SettingsPage() {
  const [profile, org, apiKeys] = await Promise.all([
    getProfile(),
    getOrgSettings(),
    getRequesterApiKeys(),
  ]);

  if (!Array.isArray(apiKeys) && apiKeys && "error" in apiKeys) {
    const error = apiKeys.error;
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {error}
      </div>
    );
  }

  const profileData: ProfileData | null = profile
    ? {
        full_name: profile.full_name,
        bio: profile.bio,
        timezone: profile.timezone,
        locale: profile.locale,
      }
    : null;

  const orgData: OrgSettings | null = org
    ? {
        company_name: org.company_name,
        contact_email: org.contact_email,
        tax_id: org.tax_id,
        default_currency: org.default_currency,
      }
    : null;

  const apiKeyData: ApiKey[] = Array.isArray(apiKeys)
    ? apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        created_at: key.created_at,
        revoked_at: key.revoked_at,
      }))
    : [];

  return (
    <div className="space-y-6 pb-10">
      <RequesterPageHeader
        title="Workspace Configuration"
        description="Manage personal profile details, organization defaults, and API credentials used by your integrations."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="pb-4 border-b border-slate-200">
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Your identity and communication preferences</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <ProfileForm profile={profileData} />
          </CardContent>
        </Card>

        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="pb-4 border-b border-slate-200">
            <CardTitle className="text-base">Organization</CardTitle>
            <CardDescription>Billing and account defaults for requester operations</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <OrgForm org={orgData} />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none border-border bg-background rounded-2xl">
        <CardHeader className="pb-4 border-b border-slate-200">
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>Create and revoke integration credentials safely</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <ApiKeysCard keys={apiKeyData} />
        </CardContent>
      </Card>
    </div>
  );
}
