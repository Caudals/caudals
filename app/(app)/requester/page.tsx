import Link from "next/link";
import {
  KpiCards,
  ActivityAreaChart,
  NextActionsList,
  OnboardingProgressCard,
  NotificationsFeed,
  QuickOpsPanel,
} from "@/components/requester/dashboard/overview-panels";
import { getRequesterDashboardData } from "@/lib/actions/requester-actions";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, PlusCircle } from "lucide-react";
import { DashboardTelemetry } from "@/components/analytics/dashboard-telemetry";

export default async function RequesterOverviewPage() {
  const dashboard = await getRequesterDashboardData();

  if ("error" in dashboard) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Unable to load dashboard</CardTitle>
          <CardDescription>{dashboard.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { stats, chart, onboarding, notifications } = dashboard;

  return (
    <div className="space-y-6">
      <DashboardTelemetry role="requester" />
      <header className="flex flex-col gap-4 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Requester workspace</p>
          <h1 className="text-2xl font-semibold">Control center</h1>
          <p className="text-sm text-muted-foreground">
            Monitor progress, unlock datasets, and keep contributors unblocked.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link
              href="/requester/datasets/new"
              data-dashboard-action="requester_new_dataset"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              New dataset
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              href="/requester/files"
              data-dashboard-action="requester_manage_downloads"
            >
              Manage downloads
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <KpiCards stats={stats} />

      <QuickOpsPanel pendingActions={stats.submissions.pending} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ActivityAreaChart data={chart} />
          <NextActionsList actions={stats.pendingActions} />
        </div>
        <div className="space-y-6">
          <OnboardingProgressCard steps={onboarding} />
          <NotificationsFeed notifications={notifications} />
        </div>
      </div>
    </div>
  );
}
