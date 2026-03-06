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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, PlusCircle, TriangleAlert, Database } from "lucide-react";
import { DashboardTelemetry } from "@/components/analytics/dashboard-telemetry";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function RequesterOverviewPage() {
  const dashboard = await getRequesterDashboardData();

  if ("error" in dashboard) {
    return (
      <Card className="border-border shadow-none bg-destructive/5 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-destructive">Unable to load dashboard</CardTitle>
          <CardDescription>{dashboard.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { stats, chart, onboarding, notifications } = dashboard;
  const highPriorityAlerts = notifications.filter(
    (item) => item.severity === "critical" || item.severity === "warning",
  );

  return (
    <div className="space-y-6 pb-10">
      <DashboardTelemetry role="requester" />

      <RequesterPageHeader
        title="Dataset Operations Command"
        description="Monitor collection progress, clear review bottlenecks, and keep funding and exports on track from one place."
        actions={
          <div className="flex gap-2">
            <Button asChild className="shadow-none rounded-lg">
              <Link href="/requester/datasets/new" data-dashboard-action="requester_new_dataset">
                <PlusCircle className="mr-2 h-4 w-4" />
                New dataset
              </Link>
            </Button>
            <Button variant="outline" asChild className="shadow-none rounded-lg">
              <Link href="/requester/datasets?filter=pending_review" data-dashboard-action="requester_open_review_queue">
                Review queue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />

      {highPriorityAlerts.length > 0 ? (
        <Card className="border border-amber-200/50 shadow-none bg-amber-50/50 rounded-2xl">
          <CardContent className="flex items-start gap-3 p-5">
            <TriangleAlert className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Attention required</p>
              <p className="text-sm text-amber-700/80 mt-0.5">
                You have {highPriorityAlerts.length} critical or warning notifications impacting active datasets.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <KpiCards stats={stats} />

      <QuickOpsPanel pendingActions={stats.submissions.pending} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
