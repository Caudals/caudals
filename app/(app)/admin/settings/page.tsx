import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  getPlatformSettings,
  upsertPlatformSetting,
} from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import Link from "next/link";
import { Save } from "lucide-react";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const result = await getPlatformSettings();

  if ("error" in result) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 shadow-none">
        <CardContent className="py-6">
          <p className="font-semibold text-destructive">
            Unable to load settings
          </p>
          <p className="text-sm text-slate-500">
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
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        title="Platform Settings"
        description="Set default commission, support contact routes, and production domain controls."
        actions={
          <Button asChild variant="outline" className="shadow-none rounded-lg">
            <Link
              href="/admin/analytics"
              data-dashboard-action="admin_settings_open_analytics"
            >
              Open analytics
            </Link>
          </Button>
        }
      />

      <Card className="border-border shadow-none rounded-2xl bg-background max-w-3xl">
        <CardHeader className="pb-4 border-b border-slate-200">
          <CardTitle>General Configuration</CardTitle>
          <CardDescription>Manage core platform variables and operational defaults.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form action={saveSettings} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="commission" className="text-sm font-medium text-foreground">Default commission (%)</Label>
                <Input
                  id="commission"
                  name="commission"
                  type="number"
                  min={0}
                  step="0.1"
                  defaultValue={defaultCommission}
                  className="shadow-none rounded-lg h-10 bg-muted/20 focus:bg-background transition-colors"
                />
                <p className="text-xs text-slate-500 mt-1">Platform take rate applied to new payouts.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supportEmail" className="text-sm font-medium text-foreground">Support email</Label>
                <Input
                  id="supportEmail"
                  name="supportEmail"
                  type="email"
                  defaultValue={supportEmail}
                  placeholder="support@caudals.com"
                  className="shadow-none rounded-lg h-10 bg-muted/20 focus:bg-background transition-colors"
                />
                <p className="text-xs text-slate-500 mt-1">Where contributor inquiries are routed.</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="defaultDomain" className="text-sm font-medium text-foreground">Default domain</Label>
                <Input
                  id="defaultDomain"
                  name="defaultDomain"
                  defaultValue={defaultDomain}
                  placeholder="app.caudals.com"
                  className="shadow-none rounded-lg h-10 bg-muted/20 focus:bg-background transition-colors"
                />
                <p className="text-xs text-slate-500 mt-1">Canonical domain for shared links and emails.</p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <Button type="submit" className="rounded-lg shadow-none px-6">
                <Save className="h-4 w-4 mr-2" />
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
