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
  FilePlus2,
  LifeBuoy,
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
      color: "text-blue-600",
      bg: "bg-blue-50/30",
    },
    {
      label: "Reviews pending",
      value: stats.submissions.pending,
      description: "need your attention",
      icon: Activity,
      color: "text-amber-600",
      bg: "bg-amber-50/30",
    },
    {
      label: "Funded",
      value: `$${stats.funding.totalFunded.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}`,
      description: "total budget committed",
      icon: CircleDollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50/30",
    },
    {
      label: "Exports ready",
      value: stats.exports.ready,
      description: "downloads prepared",
      icon: Download,
      color: "text-purple-600",
      bg: "bg-purple-50/30",
    },
  ];

  return (
    <Card className="shadow-none border-border bg-background rounded-2xl">
      <CardContent className="p-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border/50">
          {cards.map((card) => (
            <div key={card.label} className={`p-5 flex flex-col justify-center ${card.bg}`}>
              <div className={`flex items-center gap-2 mb-2 ${card.color}`}>
                <card.icon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">{card.label}</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">{card.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ActivityAreaChart({ data }: { data: ChartPoint[] }) {
  const maxValue = Math.max(5, ...data.map((point) => point.submissions));

  return (
    <Card className="bg-background shadow-none border-border rounded-2xl">
      <CardHeader className="pb-4 border-b border-slate-200">
        <CardTitle className="text-base">30 day submissions</CardTitle>
        <CardDescription>Incoming vs approved contributions</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid gap-6 lg:grid-cols-[1fr,200px]">
          <div className="h-56 w-full">
            <div className="flex h-full items-end gap-1.5">
              {data.map((point) => (
                <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex w-full flex-col justify-end group">
                    <div
                      className="w-full rounded-t bg-muted/60 transition-colors group-hover:bg-muted"
                      style={{
                        height: `${(point.submissions / maxValue) * 100}%`,
                      }}
                    />
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-[var(--accent)]"
                      style={{
                        height: `${(point.approvals / maxValue) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {point.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-border/60 bg-muted/10 p-5 flex flex-col justify-center">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pending reviews
              </p>
              <p className="text-3xl font-bold text-foreground">{data.reduce((sum, item) => sum + item.submissions, 0)}</p>
              <p className="text-[10px] text-slate-500 font-medium">submissions this month</p>
            </div>
            <div className="w-full h-px bg-border/50"></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Approval rate
              </p>
              <p className="text-3xl font-bold text-emerald-600">
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
    review: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    funding: <CircleDollarSign className="h-4 w-4 text-amber-600" />,
    deadline: <CalendarClock className="h-4 w-4 text-rose-600" />,
  };
  const typeLabel: Record<DashboardStats["pendingActions"][number]["type"], string> = {
    review: t("Review"),
    funding: t("Funding"),
    deadline: t("Deadline"),
  };

  return (
    <Card className="bg-background shadow-none border-border rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <CardTitle className="text-base">{t("Next actions")}</CardTitle>
          <CardDescription>{t("Keep everything moving smoothly")}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild className="h-8 shadow-none rounded-lg">
          <Link href="/requester/datasets">
            {t("View all")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-4 p-0">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-medium text-foreground">{t("All caught up!")}</p>
            <p className="text-sm text-slate-500">{t("Nothing urgent right now.")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {actions.slice(0, 6).map((action) => (
              <div
                key={`${action.id}-${action.type}`}
                className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted/50 border border-border p-2">
                    {iconMap[action.type]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground line-clamp-1">{action.title}</p>
                    <p className="text-xs text-slate-500 capitalize mt-0.5">
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
                <Button variant="ghost" size="sm" asChild className="shadow-none h-8 px-3 rounded-lg border border-transparent hover:border-border">
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
    <Card className="bg-background shadow-none border-border rounded-2xl">
      <CardHeader className="pb-4 border-b border-slate-200">
        <CardTitle className="text-base">{t("Onboarding progress")}</CardTitle>
        <CardDescription>
          {t("Complete the steps to unlock advanced automations")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-foreground">
              {t("{{completed}} of {{total}} completed", {
                completed,
                total: steps.length,
              })}
            </span>
            <span className="font-bold text-[var(--accent)]">{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>
        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center justify-between border border-border/60 rounded-xl p-3 text-sm bg-muted/5">
              <div className="flex items-center gap-3">
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-md text-[10px] uppercase tracking-wider font-semibold shadow-none px-2",
                    step.status === "done" ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50" :
                    step.status === "in_progress" ? "bg-amber-50 text-amber-700 border border-amber-200/50" : "bg-muted text-slate-500 border border-border"
                  )}
                >
                  {statusLabel[step.status]}
                </Badge>
                <span className={step.status === "done" ? "text-slate-500 line-through" : "font-medium text-foreground"}>{step.label}</span>
              </div>
              {step.status !== "done" && (
                <Button variant="ghost" size="icon" asChild className="h-8 w-8 rounded-lg shadow-none">
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
    info: "bg-blue-50 text-blue-700 border-blue-200/50",
    warning: "bg-amber-50 text-amber-700 border-amber-200/50",
    critical: "bg-red-50 text-red-700 border-red-200/50",
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
    <Card className="bg-background shadow-none border-border rounded-2xl">
      <CardHeader className="pb-4 border-b border-slate-200">
        <CardTitle className="text-base">{t("Notifications")}</CardTitle>
        <CardDescription>{t("Live health of your workspace")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500/30 mx-auto mb-3" />
            <p className="font-medium text-foreground">All clear</p>
            <p className="text-sm text-slate-500">{t("No active alerts or warnings.")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {notifications.map((notification) => (
              <Link
                key={notification.id}
                href={getHref(notification)}
                className="block p-4 transition-colors hover:bg-muted/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border shadow-none", chipBySeverity[notification.severity])}>
                      {severityLabel[notification.severity]}
                    </span>
                    <p className="text-sm font-medium text-foreground line-clamp-1">{getTitle(notification)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500/50 shrink-0" />
                </div>
                <p className="text-xs text-slate-500 mt-1 ml-1">{getMessage(notification)}</p>
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
    <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200">
      <div className="mr-2">
        <p className="text-sm font-semibold text-slate-900">{t("Quick Operations")}</p>
      </div>
      
      <Button variant="secondary" asChild className="shadow-none rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border-none h-10 px-4">
        <Link href="/requester/datasets/new">
          <FilePlus2 className="mr-2 h-4 w-4 text-slate-600" />
          {t("Create dataset")}
        </Link>
      </Button>
      
      <Button variant="secondary" asChild className="shadow-none rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border-none h-10 px-4">
        <Link href="/requester/datasets?filter=pending_review">
          <CheckCircle2 className="mr-2 h-4 w-4 text-amber-600" />
          {t("Review queue")}
          <Badge variant="secondary" className="ml-2 bg-amber-200/50 text-amber-800 shadow-none hover:bg-amber-200/50">{pendingActions}</Badge>
        </Link>
      </Button>
      
      <Button variant="secondary" asChild className="shadow-none rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border-none h-10 px-4">
        <Link href="/requester/files">
          <Download className="mr-2 h-4 w-4 text-purple-600" />
          {t("Exports & files")}
        </Link>
      </Button>
      
      <Button variant="secondary" asChild className="shadow-none rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border-none h-10 px-4">
        <Link href="/requester/support">
          <LifeBuoy className="mr-2 h-4 w-4 text-blue-600" />
          {t("Support")}
        </Link>
      </Button>
    </div>
  );
}
