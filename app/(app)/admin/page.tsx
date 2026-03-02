import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
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
  FileText,
  Globe2,
  LifeBuoy,
  Radar,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";
import { DashboardTelemetry } from "@/components/analytics/dashboard-telemetry";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export default async function AdminDashboard() {
  await requireAdmin();

  const [overviewRes, analyticsRes, paymentsRes, supportRes] =
    await Promise.all([
      getAdminOverview(),
      getAdminAnalyticsSummary(),
      getAdminPaymentsOverview(),
      getAdminSupportTickets({ pageSize: 50 }),
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
    highlight: {
      id: string;
      title: string | null;
      image_url: string | null;
      approval_status: string | null;
      status: string | null;
      featured: boolean | null;
      updated_at: string | null;
      created_at: string | null;
      profiles?: { full_name: string | null } | null;
    } | null;
    lastUpdated: string | null;
  };

  if ("error" in overviewRes) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Admin operations"
          title="Control center"
          description="Platform administration and monitoring"
        />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                Error loading dashboard
              </p>
              <p className="text-sm text-muted-foreground">
                {overviewRes.error || "Please try again later."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overview = overviewRes.data as OverviewData;
  const analytics = "data" in analyticsRes ? analyticsRes.data : null;
  const payments = "data" in paymentsRes ? paymentsRes.data : null;
  const support = "data" in supportRes ? supportRes : null;
  const highlight = overview.highlight;
  const lastUpdated = overview.lastUpdated
    ? formatDistanceToNow(new Date(overview.lastUpdated), { addSuffix: true })
    : "—";

  const reviewQueueCount =
    overview.stats.pendingRequests + overview.stats.pendingSubmissions;
  const pendingPayoutCount = payments?.totals.pendingPayouts ?? 0;
  const failedPayoutCount =
    payments?.transactions.filter(
      (tx) => tx.type === "submission_payout" && tx.status === "failed",
    ).length ?? 0;
  const openSupportCount =
    support?.data.filter(
      (ticket) => ticket.status === "open" || ticket.status === "in_progress",
    ).length ?? 0;

  const latestSupportTimestamp =
    support?.data.reduce((max, ticket) => {
      const updated = new Date(ticket.updated_at).getTime();
      return Number.isFinite(updated) ? Math.max(max, updated) : max;
    }, 0) ?? 0;

  const staleSupportCount =
    support?.data.filter((ticket) => {
      if (ticket.status === "resolved" || ticket.status === "closed") {
        return false;
      }
      const updated = new Date(ticket.updated_at).getTime();
      return latestSupportTimestamp - updated > 48 * 60 * 60 * 1000;
    }).length ?? 0;

  const visitToFundRate =
    analytics?.funnel?.conversionRates?.visitToFundPct ?? 0;
  const greetingTime = new Date().getHours() < 12 ? "morning" : "afternoon";

  const anomalyRows = [
    {
      label: "Failed payouts",
      value: failedPayoutCount,
      details:
        "Payout transactions marked as failed and needing reconciliation.",
      href: "/admin/payments",
      critical: failedPayoutCount > 0,
    },
    {
      label: "Stale support tickets (>48h)",
      value: staleSupportCount,
      details: "Open or in-progress tickets with stale updates.",
      href: "/admin/support?status=open",
      critical: staleSupportCount > 0,
    },
    {
      label: "Visit -> fund conversion",
      value: visitToFundRate,
      details: "30-day top-of-funnel to funding conversion rate.",
      href: "/admin/analytics",
      critical:
        visitToFundRate < 2 && (analytics?.funnel?.counts?.visit ?? 0) > 20,
      suffix: "%",
    },
  ];

  const thingsToDo = [
    {
      label: "Pending requests",
      href: "/admin/requests",
      count: overview.stats.pendingRequests,
    },
    {
      label: "Pending submissions",
      href: "/admin/submissions",
      count: overview.stats.pendingSubmissions,
    },
  ].filter((item) => item.count > 0);

  return (
    <div className="space-y-8">
      <DashboardTelemetry role="admin" />
      <AdminPageHeader
        eyebrow="Admin control center"
        title={`Good ${greetingTime}, Admin`}
        description="Monitor moderation queues, payout risk, and support workload from one unified surface."
        actions={
          thingsToDo.length > 0 ? (
            <Link
              href={thingsToDo[0].href}
              data-dashboard-action="admin_open_priority_queue"
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm hover:border-border/70"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-semibold text-[var(--accent-foreground)]">
                  {thingsToDo[0].count}
                </span>
                {thingsToDo[0].label}
              </div>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Button
              variant="outline"
              className="rounded-xl border px-3 py-2 text-sm"
            >
              <ShieldCheck className="mr-2 h-4 w-4 text-emerald-600" />
              All clear
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8 border-border/70 shadow-sm">
          <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="relative rounded-2xl border border-border/70 bg-muted/60 p-4">
              <div className="aspect-video rounded-xl border border-dashed border-border/70 bg-white/70 flex items-center justify-center">
                {highlight?.image_url ? (
                  <Image
                    src={highlight.image_url}
                    alt={highlight.title || "Dataset preview"}
                    width={640}
                    height={360}
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    Preview unavailable
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700">Live</Badge>
                {highlight?.featured && (
                  <Badge variant="outline">Featured</Badge>
                )}
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Last updated{" "}
                  <span className="font-medium text-foreground">
                    {lastUpdated}
                  </span>
                </p>
                {highlight?.title && (
                  <p className="text-foreground">
                    Highlight:{" "}
                    <span className="font-semibold">{highlight.title}</span>
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4" />
                  <span>app.caudals.com</span>
                </div>
                {highlight?.profiles?.full_name && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Requester: {highlight.profiles.full_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <span>
                    Status: {highlight?.status || "—"} /{" "}
                    {highlight?.approval_status || "—"}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="icon" className="rounded-xl">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="rounded-xl">
                  <FileText className="h-4 w-4" />
                </Button>
                <Link href="/" className="w-full">
                  <Button className="w-full rounded-xl bg-black text-white hover:bg-black/90">
                    Visit site
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatPill
              label="Pending reviews"
              value={
                overview.stats.pendingRequests +
                overview.stats.pendingSubmissions
              }
            />
            <StatPill
              label="Approved datasets"
              value={overview.stats.approvedDatasets}
            />
            <StatPill label="Total users" value={overview.stats.totalUsers} />
            <StatPill
              label="Submissions"
              value={overview.stats.totalSubmissions}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Activity</h2>
            <p className="text-sm text-muted-foreground">
              Recent admin actions across the platform
            </p>
          </div>
          <Link href="/admin/requests">
            <Button variant="outline" className="rounded-xl">
              View all
            </Button>
          </Link>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="grid grid-cols-12 gap-4 border-b border-border/70 bg-muted/40 px-6 py-3 text-xs font-medium text-muted-foreground">
              <div className="col-span-6">Activity</div>
              <div className="col-span-3">Type</div>
              <div className="col-span-3">When</div>
            </div>
            <div className="divide-y divide-border/70">
              {overview.activity.length === 0 && (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  No activity yet.
                </div>
              )}
              {overview.activity.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors"
                >
                  <div className="col-span-6">
                    <p className="text-sm font-medium capitalize">
                      {item.action_type?.replace("_", " ")}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <div className="col-span-3">
                    <Badge variant="outline" className="capitalize">
                      {item.target_type || "item"}
                    </Badge>
                  </div>
                  <div className="col-span-3 text-sm text-muted-foreground">
                    {item.created_at
                      ? formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                        })
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {analytics && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Users</h3>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-2 text-sm">
                {Object.entries(analytics.usersByRole).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between">
                    <span className="capitalize text-muted-foreground">
                      {role}
                    </span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Datasets</h3>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-2 text-sm">
                {Object.entries(analytics.datasetsByStatus).map(
                  ([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center justify-between"
                    >
                      <span className="capitalize text-muted-foreground">
                        {status.replace("_", " ")}
                      </span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Submissions</h3>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-2 text-sm">
                {Object.entries(analytics.submissionsByStatus).map(
                  ([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center justify-between"
                    >
                      <span className="capitalize text-muted-foreground">
                        {status}
                      </span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Operational SLA Queues</h3>
              <Radar className="h-4 w-4 text-muted-foreground" />
            </div>
            <QueueRow
              label="Review backlog"
              value={reviewQueueCount}
              href="/admin/requests"
              actionId="admin_queue_review_backlog"
              helper="Pending request and submission approvals."
            />
            <QueueRow
              label="Pending payouts"
              value={pendingPayoutCount}
              href="/admin/payments"
              actionId="admin_queue_pending_payouts"
              helper="Transfers created but not yet settled."
            />
            <QueueRow
              label="Open support"
              value={openSupportCount}
              href="/admin/support?status=open"
              actionId="admin_queue_open_support"
              helper="Tickets awaiting support ownership."
            />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Anomaly Detection</h3>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            {anomalyRows.map((row) => (
              <Link
                key={row.label}
                href={row.href}
                className="block rounded-xl border border-border/70 p-3 hover:bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm">{row.label}</p>
                  <p
                    className={
                      row.critical
                        ? "font-semibold text-destructive"
                        : "font-semibold"
                    }
                  >
                    {row.value}
                    {row.suffix ?? ""}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.details}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Escalation Shortcuts</h3>
              <LifeBuoy className="h-4 w-4 text-muted-foreground" />
            </div>
            <ShortcutRow
              icon={<Wallet className="h-4 w-4" />}
              label="Resolve payout failures"
              href="/admin/payments"
              actionId="admin_shortcut_resolve_payout_failures"
            />
            <ShortcutRow
              icon={<LifeBuoy className="h-4 w-4" />}
              label="Triage urgent tickets"
              href="/admin/support?priority=high"
              actionId="admin_shortcut_triage_tickets"
            />
            <ShortcutRow
              icon={<FileText className="h-4 w-4" />}
              label="Clear review queue"
              href="/admin/requests"
              actionId="admin_shortcut_clear_review_queue"
            />
            <ShortcutRow
              icon={<Activity className="h-4 w-4" />}
              label="Audit recent actions"
              href="/admin/activity"
              actionId="admin_shortcut_audit_activity"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function QueueRow({
  label,
  value,
  href,
  actionId,
  helper,
}: {
  label: string;
  value: number;
  href: string;
  actionId: string;
  helper: string;
}) {
  return (
    <Link
      href={href}
      data-dashboard-action={actionId}
      className="block rounded-xl border border-border/70 p-3 hover:bg-muted/30"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </Link>
  );
}

function ShortcutRow({
  icon,
  label,
  href,
  actionId,
}: {
  icon: ReactNode;
  label: string;
  href: string;
  actionId: string;
}) {
  return (
    <Link
      href={href}
      data-dashboard-action={actionId}
      className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm hover:bg-muted/30"
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
