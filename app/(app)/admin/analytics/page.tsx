import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminAnalyticsSummary } from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AnalyticsBarChart } from "@/components/admin/analytics-bar-chart";
import { AnalyticsPieChart } from "@/components/admin/analytics-pie-chart";
import { Activity, BarChart3, TrendingUp, Users } from "lucide-react";

export default async function AdminAnalyticsPage() {
  await requireAdmin();
  const res = await getAdminAnalyticsSummary();

  if ("error" in res) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 shadow-none">
        <CardContent className="py-6">
          <p className="font-semibold text-destructive">
            Unable to load analytics
          </p>
          <p className="text-sm text-slate-500">
            {res.error || "Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const data = res.data;
  const funnel = data.funnel ?? {
    windowDays: 30,
    steps: [],
    conversionRates: {
      visitToSignupPct: 0,
      signupToDatasetPct: 0,
      datasetToFundPct: 0,
      visitToFundPct: 0,
    },
  };
  const dashboardTelemetry = data.dashboardTelemetry ?? {
    windowDays: 30,
    visitsByRole: {},
    actionsByRole: {},
    avgTimeToActionMsByRole: {},
    actionToViewRatePctByRole: {},
  };

  return (
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        title="Analytics & Growth"
        description="Track user growth, conversion efficiency, and cross-role product behavior."
        actions={
          <Button asChild variant="outline" className="shadow-none rounded-lg">
            <Link
              href="/admin/activity"
              data-dashboard-action="admin_analytics_open_activity"
            >
              <Activity className="h-4 w-4 mr-2" />
              Correlate Activity
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <AnalyticsBarChart />
        <AnalyticsPieChart />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <AnalyticsCard 
          title="Users by role" 
          entries={data.usersByRole} 
          icon={<Users className="h-4 w-4 text-slate-500" />} 
        />
        <AnalyticsCard 
          title="Datasets" 
          entries={data.datasetsByStatus} 
          icon={<BarChart3 className="h-4 w-4 text-slate-500" />}
        />
        <AnalyticsCard 
          title="Submissions" 
          entries={data.submissionsByStatus} 
          icon={<Activity className="h-4 w-4 text-slate-500" />}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-200 shadow-none bg-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Funnel Conversion ({funnel.windowDays}d)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {funnel.steps.map(
                (step: { key: string; label: string; count: number }) => (
                  <div
                    key={step.key}
                    className="flex flex-col justify-center items-center text-center p-3 rounded-xl bg-muted/30"
                  >
                    <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">
                      {step.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold">{step.count}</p>
                  </div>
                ),
              )}
            </div>
            <div className="grid gap-3 text-sm grid-cols-1 sm:grid-cols-2">
              <ConversionStat
                label="Visit to Sign up"
                value={funnel.conversionRates.visitToSignupPct}
              />
              <ConversionStat
                label="Sign up to Dataset"
                value={funnel.conversionRates.signupToDatasetPct}
              />
              <ConversionStat
                label="Dataset to Fund"
                value={funnel.conversionRates.datasetToFundPct}
              />
              <ConversionStat
                label="Visit to Fund"
                value={funnel.conversionRates.visitToFundPct}
                highlight={true}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none bg-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              Dashboard Usability ({dashboardTelemetry.windowDays}d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.keys({
                ...dashboardTelemetry.visitsByRole,
                ...dashboardTelemetry.actionsByRole,
              }).map((role) => (
                <div
                  key={role}
                  className="rounded-xl border border-border p-4 text-sm"
                >
                  <p className="capitalize font-medium text-base mb-2 border-b border-border pb-2">{role}</p>
                  <div className="space-y-1.5 mt-2 text-slate-500">
                    <div className="flex justify-between">
                      <span>Views:</span>
                      <span className="font-medium text-foreground">{dashboardTelemetry.visitsByRole[role] ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Actions:</span>
                      <span className="font-medium text-foreground">{dashboardTelemetry.actionsByRole[role] ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg TTA:</span>
                      <span className="font-medium text-foreground">{dashboardTelemetry.avgTimeToActionMsByRole[role] ?? 0}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Conversion:</span>
                      <span className="font-medium text-foreground">
                        {((dashboardTelemetry.actionToViewRatePctByRole[role] ?? 0)).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {Object.keys(dashboardTelemetry.visitsByRole).length === 0 && (
              <div className="h-full min-h-[160px] flex items-center justify-center border border-dashed border-border rounded-xl">
                <p className="text-sm text-slate-500">
                  No dashboard telemetry captured yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AnalyticsCard({
  title,
  entries,
  icon,
}: {
  title: string;
  entries: Record<string, number>;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 shadow-none bg-white">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(entries).length === 0 && (
          <p className="text-sm text-slate-500">No data yet.</p>
        )}
        {Object.entries(entries).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between group">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
              <span className="capitalize text-sm text-slate-500 group-hover:text-foreground transition-colors">
                {key.replace("_", " ")}
              </span>
            </div>
            <span className="font-semibold text-sm">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConversionStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
      highlight 
        ? "bg-primary text-primary-foreground border-primary" 
        : "bg-background border-border hover:border-foreground/20"
    }`}>
      <span className={highlight ? "font-medium" : "text-slate-500"}>{label}</span>
      <span className="font-bold">{value.toFixed(1)}%</span>
    </div>
  );
}