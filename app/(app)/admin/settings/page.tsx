import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  getPlatformSettings,
  upsertPlatformSetting,
} from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import Link from "next/link";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const result = await getPlatformSettings();

  if ("error" in result) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="py-6">
          <p className="font-semibold text-destructive">
            Unable to load settings
          </p>
          <p className="text-sm text-muted-foreground">
            {result.error || "Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const settings = result.data || {};
  const defaultCommission = (settings["defaultCommission"] as number) ?? 10;
  const supportEmail = (settings["supportEmail"] as string) ?? "";
  const defaultDomain =
    (settings["defaultDomain"] as string) ?? "app.caudals.com";

  const saveSettings = async (formData: FormData) => {
    "use server";
    const commission = Number(formData.get("commission") || defaultCommission);
    const support = (formData.get("supportEmail") as string) || supportEmail;
    const domain = (formData.get("defaultDomain") as string) || defaultDomain;

    await upsertPlatformSetting("defaultCommission", commission);
    await upsertPlatformSetting("supportEmail", support);
    await upsertPlatformSetting("defaultDomain", domain);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Configuration"
        title="Platform settings"
        description="Set default commission, support contact routes, and production domain controls."
        actions={
          <Button asChild variant="outline">
            <Link
              href="/admin/analytics"
              data-dashboard-action="admin_settings_open_analytics"
            >
              Open analytics
            </Link>
          </Button>
        }
      />

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveSettings} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="commission">Default commission (%)</Label>
                <Input
                  id="commission"
                  name="commission"
                  type="number"
                  min={0}
                  step="0.1"
                  defaultValue={defaultCommission}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supportEmail">Support email</Label>
                <Input
                  id="supportEmail"
                  name="supportEmail"
                  type="email"
                  defaultValue={supportEmail}
                  placeholder="support@caudals.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultDomain">Default domain</Label>
                <Input
                  id="defaultDomain"
                  name="defaultDomain"
                  defaultValue={defaultDomain}
                  placeholder="app.caudals.com"
                />
              </div>
            </div>

            <Button type="submit" className="rounded-xl">
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
