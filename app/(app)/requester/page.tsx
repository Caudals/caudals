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
import { ArrowRight, PlusCircle, TriangleAlert } from "lucide-react";
import { DashboardTelemetry } from "@/components/analytics/dashboard-telemetry";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

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
  const highPriorityAlerts = notifications.filter(
    (item) => item.severity === "critical" || item.severity === "warning",
  );

  return (
    <div className="space-y-6">
      <DashboardTelemetry role="requester" />

      <RequesterPageHeader
        eyebrow="Requester workspace"
        title="Dataset operations control center"
        description="Monitor collection progress, clear review bottlenecks, and keep funding and exports on track from one place."
        actions={
          <>
            <Button asChild>
              <Link href="/requester/datasets/new" data-dashboard-action="requester_new_dataset">
                <PlusCircle className="mr-2 h-4 w-4" />
                New dataset
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/requester/datasets?filter=pending_review" data-dashboard-action="requester_open_review_queue">
                Open review queue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />

      {highPriorityAlerts.length > 0 ? (
        <Card className="border-amber-300/60 bg-amber-50/60">
          <CardContent className="flex items-start gap-3 p-4">
            <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Attention required</p>
              <p className="text-sm text-amber-700">
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
