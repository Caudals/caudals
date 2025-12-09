import { ReactNode } from "react";
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
        <Card key={card.label} className="border-border/70 shadow-none">
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
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <CardTitle>30 day submissions</CardTitle>
        <CardDescription>Incoming vs approved contributions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[1fr,200px]">
          <div className="h-56 w-full rounded-2xl bg-muted/60 p-3">
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
          <div className="space-y-3 rounded-2xl border border-border/70 p-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Pending reviews
              </p>
              <p className="text-2xl font-semibold">{data.reduce((sum, item) => sum + item.submissions, 0)}</p>
              <p className="text-xs text-muted-foreground">submissions this month</p>
            </div>
            <div className="rounded-xl bg-muted/70 p-4">
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
    <Card className="border-border/70 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t("Next actions")}</CardTitle>
          <CardDescription>{t("Keep everything moving smoothly")}</CardDescription>
        </div>
        <Button variant="ghost" size="sm">
          {t("View all")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 py-6 text-center text-muted-foreground">
            <ListChecks className="mb-2 h-6 w-6" />
            {t("Nothing urgent right now.")}
          </div>
        ) : (
          <div className="space-y-3">
            {actions.slice(0, 6).map((action) => (
              <div
                key={`${action.id}-${action.type}`}
                className="flex items-center justify-between rounded-xl border border-border/70 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted/70 p-2">
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
                  <a href={`/requester/datasets/${action.id}`}>{t("Open")}</a>
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
    <Card className="border-border/70 shadow-none">
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
            <div key={step.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
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

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <CardTitle>{t("Notifications")}</CardTitle>
        <CardDescription>{t("Live health of your workspace")}</CardDescription>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
            {t("All good for now.")}
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="rounded-xl border border-border/70 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", chipBySeverity[notification.severity])}>
                    {severityLabel[notification.severity]}
                  </span>
                  <p className="text-sm font-medium">{getTitle(notification)}</p>
                </div>
                <p className="text-xs text-muted-foreground">{getMessage(notification)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
