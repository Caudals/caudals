import { ContributorPageHeader } from "@/components/contributor/shared/contributor-page-header";
import { ContributorStatsCards } from "@/components/contributor/dashboard/contributor-stats-cards";
import { RecentContributions } from "@/components/contributor/dashboard/recent-contributions";
import { DashboardAreaChart } from "@/components/admin/dashboard-area-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckCircle,
  Database,
  ArrowRight,
  AlertTriangle,
  ListChecks,
  WalletCards,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getServerTranslator } from "@/lib/i18n/server";
import {
  getContributorDashboardEssentials,
  getContributorProfileQuality,
} from "@/lib/actions/contributor-actions";
import { DashboardTelemetry } from "@/components/analytics/dashboard-telemetry";

export default async function ContributorDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [quality, essentials] = await Promise.all([
    getContributorProfileQuality(),
    getContributorDashboardEssentials(),
  ]);

  const essentialsData = "error" in essentials ? null : essentials.data;
  const t = await getServerTranslator();

  return (
    <div className="space-y-6 pb-10">
      <DashboardTelemetry role="contributor" />
      <ContributorPageHeader
        title={t("Contribution command center")}
        description={t(
          "Keep submissions moving, clear reviewer feedback, and maintain payout readiness.",
        )}
        actions={
          <div className="flex gap-2">
            <Button asChild className="shadow-none rounded-lg">
              <Link
                href="/contributor/browse"
                data-dashboard-action="contributor_header_browse_opportunities"
              >
                <Database className="mr-2 h-4 w-4" />
                {t("Browse opportunities")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="shadow-none rounded-lg">
              <Link
                href="/contributor/contributions"
                data-dashboard-action="contributor_header_open_contributions"
              >
                {t("Open contributions")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />
      <ContributorStatsCards />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <DashboardAreaChart />
          
          <Card className="shadow-none border-border bg-background rounded-2xl">
            <CardHeader className="border-b border-slate-200 pb-4 mb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-5 w-5 text-[var(--accent)]" />
                {t("Task Inbox")}
              </CardTitle>
              <CardDescription>
                {t("Prioritized actions to keep your contribution flow moving")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {essentialsData?.taskInbox?.length ? (
                essentialsData.taskInbox.map((task) => (
                  <div
                    key={task.submissionId}
                    className="flex flex-col gap-3 rounded-xl border border-border p-4 md:flex-row md:items-center md:justify-between bg-muted/10 hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{task.datasetTitle}</p>
                        <Badge
                          variant="secondary"
                          className={
                            task.status === "needs_changes"
                              ? "border border-amber-200/50 bg-amber-50 text-amber-700 shadow-none text-[10px] uppercase tracking-wider px-2"
                              : "shadow-none text-[10px] uppercase tracking-wider px-2"
                          }
                        >
                          {task.status === "needs_changes"
                            ? t("Needs changes")
                            : t("Pending")}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {t("Reward")}: <span className="font-semibold text-foreground">${task.rewardAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        {" "}· {t("Updated")} {new Date(task.updatedAt).toLocaleDateString()}
                      </p>
                      {task.notePreview ? (
                        <p className="text-xs text-slate-500 line-clamp-2 mt-1 border-l-2 border-border pl-2 italic">
                          &quot;{task.notePreview}&quot;
                        </p>
                      ) : null}
                    </div>
                    <Button asChild size="sm" variant="outline" className="shadow-none rounded-lg whitespace-nowrap">
                      <Link
                        href={task.actionHref}
                        data-dashboard-action="contributor_task_inbox_open"
                      >
                        {t("Open")}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-8 w-8 text-emerald-500/30 mx-auto mb-2" />
                  <p className="text-sm text-foreground font-medium">Inbox zero</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("No tasks in your inbox right now.")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <RecentContributions />
        </div>

        <div className="space-y-6">
          <Card className="shadow-none border-border bg-background rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">{t("Profile trust score")}</CardTitle>
              <CardDescription>
                {t(
                  "Improve profile completeness to increase requester confidence",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {"error" in quality ? (
                <p className="text-sm text-slate-500">{quality.error}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl">
                    <p className="text-3xl font-bold">{quality.score}%</p>
                    <Badge variant="outline" className="capitalize shadow-none bg-background">
                      {quality.level}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 px-1">
                    {quality.checks.slice(0, 3).map((check) => (
                      <p key={check.id} className="text-xs text-slate-500 flex items-center gap-2">
                        <span className={check.completed ? "text-emerald-500" : "text-slate-500/30"}>{check.completed ? "✓" : "•"}</span> {check.label}
                      </p>
                    ))}
                  </div>
                  <Button asChild variant="outline" className="w-full shadow-none rounded-xl h-8">
                    <Link
                      href="/contributor/settings"
                      data-dashboard-action="contributor_improve_profile"
                    >
                      {t("Improve profile")}
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none border-border bg-background rounded-2xl">
            <CardHeader className="border-b border-slate-200 pb-4 mb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <WalletCards className="h-5 w-5 text-slate-500" />
                {t("Payout Forecast")}
              </CardTitle>
              <CardDescription>
                {t("Expected and blocked payout amounts")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ForecastRow
                label={t("Ready to payout")}
                value={`$${(
                  essentialsData?.payoutForecast.readyAmount ?? 0
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
                helper={`${essentialsData?.payoutForecast.readyCount ?? 0} ${t("submission(s)")}`}
              />
              <ForecastRow
                label={t("Pending transfers")}
                value={`$${(
                  essentialsData?.payoutForecast.pendingTransferAmount ?? 0
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
                helper={`${essentialsData?.payoutForecast.pendingTransferCount ?? 0} ${t("transfer(s)")}`}
              />
              <ForecastRow
                label={t("Failed transfers")}
                value={`$${(
                  essentialsData?.payoutForecast.failedTransferAmount ?? 0
                ).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
                helper={`${essentialsData?.payoutForecast.failedTransferCount ?? 0} ${t("transfer(s)")}`}
                tone="danger"
              />

              {(essentialsData?.blockers && essentialsData.blockers.length > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 mt-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    {t("Blockers")}
                  </p>
                  <div className="space-y-2">
                    {essentialsData.blockers.map((blocker) => (
                      <div
                        key={blocker}
                        className="flex items-start gap-2 text-xs text-amber-700"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{blocker}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ForecastRow({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className={`rounded-xl border p-4 ${tone === 'danger' ? 'border-destructive/20 bg-destructive/5' : 'border-border bg-muted/10'}`}>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-xs font-medium ${tone === 'danger' ? 'text-destructive' : 'text-slate-500'}`}>{label}</p>
        <p
          className={
            tone === "danger"
              ? "text-lg font-bold text-destructive"
              : "text-lg font-bold text-foreground"
          }
        >
          {value}
        </p>
      </div>
      <p className={`text-[11px] ${tone === 'danger' ? 'text-destructive/70' : 'text-slate-500'}`}>{helper}</p>
    </div>
  );
}
