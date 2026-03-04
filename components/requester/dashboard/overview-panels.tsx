import { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Download,
  ListChecks,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getServerTranslator } from "@/lib/i18n/server";

export type DashboardStats = {
  datasetCounts: Record<string, number>;
  submissions: {
    pending: number;
    approved: number;
    rejected: number;
    needsChanges: number;
  };
  funding: {
    totalBudget: number;
    totalFunded: number;
    totalSpent: number;
    walletBalance: number;
  };
  exports: {
    ready: number;
    processing: number;
  };
  pendingActions: Array<{
    id: string;
    title: string;
    type: "review" | "funding" | "deadline";
    dueAt?: string | null;
  }>;
};

export type ChartPoint = {
  date: string;
  submissions: number;
  approvals: number;
};

export type OnboardingStep = {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done";
  completed_at: string | null;
};

export type DashboardNotification = {
  id: string;
  type: "review_backlog" | "low_budget" | "export_ready";
  severity: "info" | "warning" | "critical";
  datasetTitle?: string | null;
  pendingCount?: number;
  fundedPercentage?: number;
  exportId?: string;
};

export function KpiCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      label: "Active datasets",
      value: stats.datasetCounts.active ?? 0,
      description: "currently collecting",
      icon: RefreshCcw,
    },
    {
      label: "Reviews pending",
      value: stats.submissions.pending,
      description: "need your attention",
      icon: Activity,
    },
    {
      label: "Funded",
      value: `$${stats.funding.totalFunded.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}`,
      description: "total budget committed",
      icon: CircleDollarSign,
    },
    {
      label: "Exports ready",
      value: stats.exports.ready,
      description: "downloads prepared",
      icon: Download,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="bg-card shadow-sm border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {card.label}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
            </div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ActivityAreaChart({ data }: { data: ChartPoint[] }) {
  const maxValue = Math.max(5, ...data.map((point) => point.submissions));

  return (
    <Card className="bg-card shadow-sm border border-border">
      <CardHeader>
        <CardTitle>30 day submissions</CardTitle>
        <CardDescription>Incoming vs approved contributions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[1fr,200px]">
          <div className="h-56 w-full rounded-2xl  p-3">
            <div className="flex h-full items-end gap-1">
              {data.map((point) => (
                <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex w-full flex-col justify-end">
                    <div
                      className="w-full rounded-t bg-primary/50"
                      style={{
                        height: `${(point.submissions / maxValue) * 100}%`,
                      }}
                    />
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-primary"
                      style={{
                        height: `${(point.approvals / maxValue) * 100}%`,
                        mixBlendMode: "multiply",
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {point.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-gray-50/50 p-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Pending reviews
              </p>
              <p className="text-2xl font-semibold">{data.reduce((sum, item) => sum + item.submissions, 0)}</p>
              <p className="text-xs text-muted-foreground">submissions this month</p>
            </div>
            <div className="rounded-xl  p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Approval rate
              </p>
              <p className="text-3xl font-semibold">
                {Math.round(
                  (data.reduce((sum, item) => sum + item.approvals, 0) /
                    Math.max(1, data.reduce((sum, item) => sum + item.submissions, 0))) *
                    100
                )}
                %
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export async function NextActionsList({ actions }: { actions: DashboardStats["pendingActions"] }) {
  const t = await getServerTranslator();
  const iconMap: Record<DashboardStats["pendingActions"][number]["type"], ReactNode> = {
    review: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    funding: <CircleDollarSign className="h-4 w-4 text-amber-500" />,
    deadline: <CalendarClock className="h-4 w-4 text-rose-500" />,
  };
  const typeLabel: Record<DashboardStats["pendingActions"][number]["type"], string> = {
    review: t("Review"),
    funding: t("Funding"),
    deadline: t("Deadline"),
  };

  return (
    <Card className="bg-card shadow-sm border border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t("Next actions")}</CardTitle>
          <CardDescription>{t("Keep everything moving smoothly")}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/requester/datasets">
            {t("View all")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 py-6 text-center text-muted-foreground">
            <ListChecks className="mb-2 h-6 w-6" />
            {t("Nothing urgent right now.")}
          </div>
        ) : (
          <div className="space-y-3">
            {actions.slice(0, 6).map((action) => (
              <div
                key={`${action.id}-${action.type}`}
                className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 py-3 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full  p-2">
                    {iconMap[action.type]}
                  </div>
                    <div>
                      <p className="text-sm font-medium">{action.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {typeLabel[action.type]}
                        {action.dueAt && (
                          <>
                            {" · "}
                            {t("Due {{date}}", {
                              date: new Date(action.dueAt).toLocaleDateString(),
                            })}
                          </>
                        )}
                      </p>
                    </div>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/requester/datasets/${action.id}`}>{t("Open")}</Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export async function OnboardingProgressCard({ steps }: { steps: OnboardingStep[] }) {
  const t = await getServerTranslator();
  const completed = steps.filter((step) => step.status === "done").length;
  const percent = Math.round((completed / Math.max(steps.length, 1)) * 100);
  const statusLabel: Record<OnboardingStep["status"], string> = {
    pending: t("Pending"),
    in_progress: t("In progress"),
    done: t("Done"),
  };

  return (
    <Card className="bg-card shadow-sm border border-border">
      <CardHeader>
        <CardTitle>{t("Onboarding progress")}</CardTitle>
        <CardDescription>
          {t("Complete the steps to unlock advanced automations")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span>
              {t("{{completed}} of {{total}} completed", {
                completed,
                total: steps.length,
              })}
            </span>
            <span>{percent}%</span>
          </div>
          <Progress value={percent} className="mt-2" />
        </div>
        <div className="space-y-2">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 py-3 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full text-[10px] uppercase",
                    step.status === "done" && "bg-emerald-500/10 text-emerald-600",
                    step.status === "in_progress" && "bg-amber-500/10 text-amber-600"
                  )}
                >
                  {statusLabel[step.status]}
                </Badge>
                <span>{step.label}</span>
              </div>
              {step.status !== "done" && (
                <Button variant="ghost" size="icon" asChild>
                  <a href="/requester/onboarding">
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export async function NotificationsFeed({
  notifications,
}: {
  notifications: DashboardNotification[];
}) {
  const t = await getServerTranslator();
  const chipBySeverity: Record<DashboardNotification["severity"], string> = {
    info: "bg-blue-500/10 text-blue-700",
    warning: "bg-amber-500/10 text-amber-700",
    critical: "bg-rose-500/10 text-rose-700",
  };
  const severityLabel: Record<DashboardNotification["severity"], string> = {
    info: t("Info"),
    warning: t("Warning"),
    critical: t("Critical"),
  };

  const getTitle = (notification: DashboardNotification) => {
    switch (notification.type) {
      case "review_backlog":
        return t("{{dataset}} needs review attention", {
          dataset: notification.datasetTitle ?? t("Dataset"),
        });
      case "low_budget":
        return t("Budget low for {{dataset}}", {
          dataset: notification.datasetTitle ?? t("Dataset"),
        });
      case "export_ready":
        return t("Export ready");
      default:
        return notification.datasetTitle ?? "";
    }
  };

  const getMessage = (notification: DashboardNotification) => {
    switch (notification.type) {
      case "review_backlog":
        return t("{{count}} submissions pending review", {
          count: notification.pendingCount ?? 0,
        });
      case "low_budget":
        return t("Only {{percent}}% funded", {
          percent: notification.fundedPercentage ?? 0,
        });
      case "export_ready":
        return t("Dataset export {{id}} is ready to download", {
          id: notification.exportId ?? "",
        });
      default:
        return "";
    }
  };

  const getHref = (notification: DashboardNotification) => {
    switch (notification.type) {
      case "review_backlog":
        return "/requester/datasets?filter=pending_review";
      case "low_budget":
        return "/requester/datasets?filter=needs_funding";
      case "export_ready":
        return "/requester/files";
      default:
        return "/requester";
    }
  };

  return (
    <Card className="bg-card shadow-sm border border-border">
      <CardHeader>
        <CardTitle>{t("Notifications")}</CardTitle>
        <CardDescription>{t("Live health of your workspace")}</CardDescription>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 py-6 text-center text-sm text-muted-foreground">
            {t("All good for now.")}
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Link
                key={notification.id}
                href={getHref(notification)}
                className="block border-b border-slate-100 dark:border-zinc-800 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/50 last:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", chipBySeverity[notification.severity])}>
                      {severityLabel[notification.severity]}
                    </span>
                    <p className="text-sm font-medium">{getTitle(notification)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">{getMessage(notification)}</p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export async function QuickOpsPanel({
  pendingActions,
}: {
  pendingActions: number;
}) {
  const t = await getServerTranslator();
  return (
    <Card className="bg-card shadow-sm border border-border">
      <CardHeader>
        <CardTitle>{t("Operations")}</CardTitle>
        <CardDescription>{t("Fast access to the most used requester workflows")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Link href="/requester/datasets/new" className="rounded-xl border border-border bg-gray-50/50 p-4 transition-colors hover:bg-gray-100">
          <p className="text-sm font-medium">{t("Create dataset")}</p>
          <p className="text-xs text-muted-foreground">{t("Launch a new data brief")}</p>
        </Link>
        <Link href="/requester/datasets?filter=pending_review" className="rounded-xl border border-border bg-gray-50/50 p-4 transition-colors hover:bg-gray-100">
          <p className="text-sm font-medium">{t("Review queue")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Pending submissions: {{count}}", { count: pendingActions })}
          </p>
        </Link>
        <Link href="/requester/files" className="rounded-xl border border-border bg-gray-50/50 p-4 transition-colors hover:bg-gray-100">
          <p className="text-sm font-medium">{t("Exports & files")}</p>
          <p className="text-xs text-muted-foreground">{t("Download and monitor export jobs")}</p>
        </Link>
        <Link href="/requester/support" className="rounded-xl border border-border bg-gray-50/50 p-4 transition-colors hover:bg-gray-100">
          <p className="text-sm font-medium">{t("Support center")}</p>
          <p className="text-xs text-muted-foreground">{t("Open or reply to support tickets")}</p>
        </Link>
      </CardContent>
    </Card>
  );
}
