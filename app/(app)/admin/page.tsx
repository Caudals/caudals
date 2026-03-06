import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  getAdminOverview,
  getAdminAnalyticsSummary,
  getAdminPaymentsOverview,
  getAdminSupportTickets,
} from "@/lib/actions/admin-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  FileText,
  ShieldAlert,
  Users,
  Wallet,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { DashboardTelemetry } from "@/components/analytics/dashboard-telemetry";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getServerTranslator } from "@/lib/i18n/server";
import { DashboardAreaChart } from "@/components/admin/dashboard-area-chart";

export default async function AdminDashboard() {
  await requireAdmin();
  const t = await getServerTranslator();

  const [overviewRes, analyticsRes, paymentsRes] =
    await Promise.all([
      getAdminOverview(),
      getAdminAnalyticsSummary(),
      getAdminPaymentsOverview(),
    ]);

  type OverviewData = {
    stats: {
      pendingRequests: number;
      pendingSubmissions: number;
      totalSubmissions: number;
      totalUsers: number;
      approvedDatasets: number;
    };
    activity: {
      id: string;
      action_type: string | null;
      target_type: string | null;
      target_id: string | null;
      notes: string | null;
      created_at: string | null;
    }[];
    lastUpdated: string | null;
  };

  if ("error" in overviewRes) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title={t("Control center")}
          description={t("Platform administration and monitoring")}
        />
        <Card className="border-destructive/40 bg-destructive/5 shadow-none rounded-2xl">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                {t("Error loading dashboard")}
              </p>
              <p className="text-sm text-slate-500">
                {overviewRes.error || t("Please try again later.")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overview = overviewRes.data as OverviewData;
  const analytics = "data" in analyticsRes ? analyticsRes.data : null;
  
  const pendingPayoutCount = "data" in paymentsRes && paymentsRes.data ? paymentsRes.data.totals.pendingPayouts : 0;
  const failedPayoutCount = "data" in paymentsRes && paymentsRes.data ? paymentsRes.data.transactions.filter(
    (tx) => tx.type === "submission_payout" && tx.status === "failed",
  ).length : 0;

  const greetingTime = new Date().getHours() < 12 ? "morning" : "afternoon";

  return (
    <div className="space-y-6 pb-10">
      <DashboardTelemetry role="admin" />
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-b border-border/40 pb-6 mb-6">
        <div className="flex items-stretch gap-3">
          <div className="w-1.5 rounded-full bg-[var(--accent)]/80" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)] mb-1.5">Admin Workspace</p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t(`Good ${greetingTime}, Admin`)}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {t("Here is what's happening on your platform today.")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="shadow-none rounded-lg" asChild>
            <Link href="/admin/activity">
              <Activity className="mr-2 h-4 w-4" />
              {t("Audit Log")}
            </Link>
          </Button>
          <Button className="shadow-none rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white" asChild>
            <Link href="/admin/requests">
              <CheckCircle className="mr-2 h-4 w-4" />
              {t("Review Queue")}
              {overview.stats.pendingRequests > 0 && (
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                  {overview.stats.pendingRequests}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="md:col-span-5 space-y-6">
          <Card className="shadow-none border-border bg-background rounded-2xl">
            <CardContent className="p-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/50">
                <div className="p-4 flex flex-col justify-center">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Users className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{overview.stats.totalUsers.toLocaleString()}</div>
                </div>
                <div className="p-4 flex flex-col justify-center">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Approved Datasets</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{overview.stats.approvedDatasets.toLocaleString()}</div>
                </div>
                <div className="p-4 flex flex-col justify-center bg-amber-50/30">
                  <div className="flex items-center gap-2 text-amber-700 mb-2">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Pending Submissions</span>
                  </div>
                  <div className="text-2xl font-bold text-amber-800">{overview.stats.pendingSubmissions.toLocaleString()}</div>
                </div>
                <div className={`p-4 flex flex-col justify-center ${failedPayoutCount > 0 ? 'bg-red-50/50' : 'bg-emerald-50/30'}`}>
                  <div className={`flex items-center gap-2 mb-2 ${failedPayoutCount > 0 ? 'text-destructive' : 'text-emerald-700'}`}>
                    <Wallet className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Failed Payouts</span>
                  </div>
                  <div className={`text-2xl font-bold ${failedPayoutCount > 0 ? 'text-destructive' : 'text-emerald-800'}`}>
                    {failedPayoutCount.toLocaleString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <DashboardAreaChart />
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-none border-border bg-muted/10 rounded-2xl">
            <CardHeader className="pb-3 border-b border-slate-200">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider">
                <ShieldAlert className="h-4 w-4 text-[var(--accent)]" />
                {t("Action Required")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 grid gap-2">
              <ActionItem
                title={t("Review Requests")}
                description={`${overview.stats.pendingRequests} ${t("waiting")}`}
                href="/admin/requests"
                urgent={overview.stats.pendingRequests > 10}
              />
              <ActionItem
                title={t("Process Payouts")}
                description={`${pendingPayoutCount} ${t("pending transfers")}`}
                href="/admin/payments"
                urgent={pendingPayoutCount > 5}
              />
              {analytics && (
                <ActionItem
                  title={t("Conversion Alert")}
                  description={t("Visit to fund < 2%")}
                  href="/admin/analytics"
                  urgent={
                    (analytics.funnel?.conversionRates?.visitToFundPct ?? 0) < 2 &&
                    (analytics.funnel?.counts?.visit ?? 0) > 20
                  }
                />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none border-border rounded-2xl bg-background overflow-hidden py-0 gap-0">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-200 bg-muted/5">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">{t("Recent Activity")}</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2 shadow-none" asChild>
                <Link href="/admin/activity">{t("View all")}</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {overview.activity.slice(0, 4).map((item) => (
                  <div key={item.id} className="p-3 hover:bg-muted/10 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                        <Activity className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <div className="grid gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground line-clamp-1 capitalize">
                            {item.action_type?.replace("_", " ")}
                          </p>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            {item.created_at ? formatDistanceToNow(new Date(item.created_at)) : ""}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {item.notes || `${t("Target:")} ${item.target_type}`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {overview.activity.length === 0 && (
                  <div className="p-6 text-center text-sm text-slate-500">{t("No recent activity.")}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActionItem({ title, description, href, urgent }: { title: string; description: string; href: string; urgent: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between rounded-xl border p-3 transition-colors ${
        urgent 
          ? "border-destructive/30 bg-destructive/5 hover:border-destructive/50 hover:bg-destructive/10" 
          : "border-border bg-background hover:border-foreground/30 hover:bg-muted/10"
      }`}
    >
      <div className="grid gap-0.5">
        <p className={`text-sm font-semibold ${urgent ? "text-destructive" : "text-foreground"}`}>{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <ArrowRight className={`h-4 w-4 transition-transform group-hover:translate-x-1 ${urgent ? "text-destructive" : "text-slate-500"}`} />
    </Link>
  );
}
