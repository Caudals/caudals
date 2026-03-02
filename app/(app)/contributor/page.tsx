import { ContributorPageHeader } from "@/components/contributor/shared/contributor-page-header";
import { ContributorStatsCards } from "@/components/contributor/dashboard/contributor-stats-cards";
import { RecentContributions } from "@/components/contributor/dashboard/recent-contributions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TrendingUp,
  Send,
  Clock,
  CheckCircle,
  Database,
  ArrowRight,
  AlertTriangle,
  ListChecks,
  MessageSquareWarning,
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

  let submissionStats = {
    total: 0,
    approved: 0,
    pending: 0,
    totalEarnings: 0,
  };

  if (user) {
    const { data: submissions } = await supabase
      .from("submissions")
      .select("status, dataset_requests(reward_amount)")
      .eq("contributor_id", user.id);

    if (submissions) {
      submissionStats = {
        total: submissions.length,
        approved: submissions.filter((s) => s.status === "approved").length,
        pending: submissions.filter((s) => s.status === "pending").length,
        totalEarnings: submissions
          .filter((s) => s.status === "approved")
          .reduce((sum, s) => {
            const rel = Array.isArray(s.dataset_requests)
              ? s.dataset_requests[0]
              : s.dataset_requests;
            return sum + (rel?.reward_amount || 0);
          }, 0),
      };
    }
  }

  const [quality, essentials] = await Promise.all([
    getContributorProfileQuality(),
    getContributorDashboardEssentials(),
  ]);

  const essentialsData = "error" in essentials ? null : essentials.data;
  const t = await getServerTranslator();

  return (
    <div className="space-y-6">
      <DashboardTelemetry role="contributor" />
      <ContributorPageHeader
        eyebrow={t("Contributor workspace")}
        title={t("Contribution command center")}
        description={t(
          "Keep submissions moving, clear reviewer feedback, and maintain payout readiness.",
        )}
        actions={
          <>
            <Button asChild>
              <Link
                href="/browse"
                data-dashboard-action="contributor_header_browse_opportunities"
              >
                <Database className="mr-2 h-4 w-4" />
                {t("Browse opportunities")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href="/contributor/contributions"
                data-dashboard-action="contributor_header_open_contributions"
              >
                {t("Open contributions")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />
      <ContributorStatsCards />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-emerald-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              {t("Earnings Overview")}
            </CardTitle>
            <CardDescription>
              {t("Track your earnings and payouts")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t("Total Earned")}
                </span>
                <span className="text-lg font-semibold">
                  $
                  {submissionStats.totalEarnings.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t("Approved")}
                </span>
                <span className="text-sm font-medium">
                  {submissionStats.approved} {t("submissions")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t("Pending")}
                </span>
                <span className="text-sm font-medium">
                  {submissionStats.pending} {t("submissions")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {t("Find Opportunities")}
            </CardTitle>
            <CardDescription>
              {t("Browse available datasets and contribute")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full">
              <Link
                href="/browse"
                data-dashboard-action="contributor_browse_datasets"
              >
                <Database className="mr-2 h-4 w-4" />
                {t("Browse Datasets")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link
                href="/contributor/contributions"
                data-dashboard-action="contributor_open_contributions"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {t("My Contributions")}
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Profile trust score")}</CardTitle>
            <CardDescription>
              {t(
                "Improve profile completeness to increase requester confidence",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {"error" in quality ? (
              <p className="text-sm text-muted-foreground">{quality.error}</p>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-semibold">{quality.score}%</p>
                  <Badge variant="outline" className="capitalize">
                    {quality.level}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {quality.checks.slice(0, 3).map((check) => (
                    <p key={check.id} className="text-xs text-muted-foreground">
                      {check.completed ? "✓" : "•"} {check.label}
                    </p>
                  ))}
                </div>
                <Button asChild variant="outline" className="w-full">
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Submission Pipeline")}</CardTitle>
          <CardDescription>
            {t("Track your contributions across stages")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-blue-500/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Send className="h-5 w-5 text-blue-600" />
                <Badge variant="secondary">{submissionStats.total}</Badge>
              </div>
              <p className="text-sm font-medium">{t("Total Submitted")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("All contributions")}
              </p>
            </div>

            <div className="rounded-lg border bg-yellow-500/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Clock className="h-5 w-5 text-yellow-600" />
                <Badge variant="outline" className="bg-yellow-500/10">
                  {submissionStats.pending}
                </Badge>
              </div>
              <p className="text-sm font-medium">{t("Under Review")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Awaiting approval")}
              </p>
            </div>

            <div className="rounded-lg border bg-emerald-500/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <Badge className="bg-emerald-600">
                  {submissionStats.approved}
                </Badge>
              </div>
              <p className="text-sm font-medium">{t("Approved")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Earning rewards")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
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
                  className="flex flex-col gap-3 rounded-xl border border-border/70 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{task.datasetTitle}</p>
                      <Badge
                        variant="outline"
                        className={
                          task.status === "needs_changes"
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : ""
                        }
                      >
                        {task.status === "needs_changes"
                          ? t("Needs changes")
                          : t("Pending review")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("Reward")}: $
                      {task.rewardAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      · {t("Updated")}{" "}
                      {new Date(task.updatedAt).toLocaleDateString()}
                    </p>
                    {task.notePreview ? (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {task.notePreview}
                      </p>
                    ) : null}
                  </div>
                  <Button asChild size="sm" variant="outline">
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
              <p className="text-sm text-muted-foreground">
                {t("No tasks in your inbox right now.")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-5 w-5" />
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

            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("Blockers")}
              </p>
              <div className="space-y-2">
                {essentialsData?.blockers?.map((blocker) => (
                  <div
                    key={blocker}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600" />
                    <span>{blocker}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5" />
            {t("Feedback Queue")}
          </CardTitle>
          <CardDescription>
            {t(
              "Submissions requiring revision or containing reviewer feedback",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {essentialsData?.feedbackQueue?.length ? (
            essentialsData.feedbackQueue.map((item) => (
              <div
                key={item.submissionId}
                className="flex flex-col gap-3 rounded-xl border border-border/70 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{item.datasetTitle}</p>
                    <Badge
                      variant="outline"
                      className={
                        item.status === "rejected"
                          ? "border-destructive/40 bg-destructive/5 text-destructive"
                          : "border-amber-300 bg-amber-50 text-amber-700"
                      }
                    >
                      {item.status === "rejected"
                        ? t("Rejected")
                        : t("Needs changes")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("Last update")}:{" "}
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.notePreview || t("No reviewer notes were provided.")}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={item.actionHref}
                    data-dashboard-action="contributor_feedback_open_submission"
                  >
                    {t("Review submission")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("No feedback items are waiting on your side.")}
            </p>
          )}
        </CardContent>
      </Card>

      <RecentContributions />
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
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={
            tone === "danger"
              ? "text-sm font-semibold text-destructive"
              : "text-sm font-semibold"
          }
        >
          {value}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
