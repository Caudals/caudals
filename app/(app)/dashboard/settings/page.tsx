import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SettingsForms } from "@/components/dashboard/settings-forms";

export default function SettingsPage() {
  return (
    <>
      <DashboardHeader title="Settings" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Account Settings
          </h2>
          <p className="text-muted-foreground">
            Manage your account preferences and settings
          </p>
        </div>
        <SettingsForms />
      </div>
    </>
  );
}
