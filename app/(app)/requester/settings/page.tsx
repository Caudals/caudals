import { getProfile } from "@/lib/actions/profile-actions";
import { getOrgSettings, getRequesterApiKeys } from "@/lib/actions/requester-actions";
import { ProfileForm, ProfileData } from "@/components/requester/settings/profile-form";
import { OrgForm, OrgSettings } from "@/components/requester/settings/org-form";
import { ApiKeysCard, ApiKey } from "@/components/requester/settings/api-keys-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="text-2xl font-semibold">Workspace settings</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profileData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <OrgForm org={orgData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
          </CardHeader>
          <CardContent>
            <ApiKeysCard keys={apiKeyData} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
