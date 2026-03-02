import React from "react";
import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  getAdminPaymentsOverview,
  getAdminPayoutQueues,
  reconcilePayoutTransaction,
} from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Download,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import Link from "next/link";

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const [overviewRes, queueRes] = await Promise.all([
    getAdminPaymentsOverview(),
    getAdminPayoutQueues(),
  ]);

  if ("error" in overviewRes || "error" in queueRes) {
    return (
      <div className="space-y-4">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                Unable to load payments
              </p>
              <p className="text-sm text-muted-foreground">
                {"error" in overviewRes
                  ? overviewRes.error
                  : "error" in queueRes
                    ? queueRes.error
                    : "Please try again later."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { totals, transactions } = overviewRes.data;
  const payoutQueues = queueRes;

  const totalVolumeCents =
    Number((totals as { total_volume_cents?: number }).total_volume_cents) ||
    Number(totals.totalVolume || 0);
  const platformCommissionCents =
    Number(
      (totals as { platform_commission_cents?: number })
        .platform_commission_cents,
    ) || Number(totals.platformCommission || 0);
  const payoutVolumeCents =
    Number((totals as { payout_volume_cents?: number }).payout_volume_cents) ||
    Number(totals.payoutVolume || 0);

  const formatMoney = (amount: number | null | undefined, currency = "USD") =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      Number(amount || 0) / 100,
    );

  const latest = transactions.slice(0, 12);

  const retryFailedPayout = async (formData: FormData) => {
    "use server";
    const transactionId = String(formData.get("transactionId") || "");
    const note = String(formData.get("note") || "");
    await reconcilePayoutTransaction(transactionId, "pending", note);
  };

  const cancelFailedPayout = async (formData: FormData) => {
    "use server";
    const transactionId = String(formData.get("transactionId") || "");
    const note = String(formData.get("note") || "");
    await reconcilePayoutTransaction(transactionId, "cancelled", note);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Financial operations"
        title="Payment overview"
        description="Reconcile payout failures, monitor queue age, and keep transfer SLAs healthy."
        actions={
          <>
            <Button asChild variant="outline">
              <Link
                href="/admin/support?tPriority=urgent"
                data-dashboard-action="admin_payments_open_support_escalations"
              >
                Escalation queue
              </Link>
            </Button>
            <Button variant="outline" className="rounded-xl">
              <Download className="mr-2 h-4 w-4" />
              Export ledger
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total volume"
          value={formatMoney(totalVolumeCents)}
          icon={<CreditCard className="h-4 w-4 text-emerald-600" />}
        />
        <StatCard
          label="Platform commission"
          value={formatMoney(platformCommissionCents)}
          icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
        />
        <StatCard
          label="Payouts sent"
          value={formatMoney(payoutVolumeCents)}
          icon={<ArrowDownRight className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Pending payouts"
          value={totals.pendingPayouts.toString()}
          icon={<Wallet className="h-4 w-4 text-amber-600" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Failed payout queue</p>
            <p className="text-2xl font-semibold text-destructive">
              {payoutQueues.totals.failedCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Pending payout queue
            </p>
            <p className="text-2xl font-semibold">
              {payoutQueues.totals.pendingCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Stale pending (24h+)
            </p>
            <p className="text-2xl font-semibold text-amber-600">
              {payoutQueues.totals.stalePendingCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>Failed payouts (reconciliation queue)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Retry failed payout transactions or cancel with an audit note.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Contributor</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payoutQueues.failed.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No failed payouts.
                  </TableCell>
                </TableRow>
              )}
              {payoutQueues.failed.map((tx) => (
                <TableRow key={tx.id} className="align-top hover:bg-muted/30">
                  <TableCell className="text-sm">
                    <div>{tx.contributor_name || "Unknown contributor"}</div>
                    <div className="text-xs text-muted-foreground">
                      {tx.contributor_email || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {tx.dataset_title ||
                      tx.dataset_request_id ||
                      "Unknown dataset"}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatMoney(tx.amount, tx.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(tx.updated_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-sm">
                    {tx.failure_reason ||
                      "No explicit failure reason recorded."}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-[340px] flex-col gap-2 md:items-end">
                      <form
                        action={retryFailedPayout}
                        className="flex w-full gap-2 md:w-auto"
                      >
                        <input
                          type="hidden"
                          name="transactionId"
                          value={tx.id}
                        />
                        <Input
                          name="note"
                          placeholder="Retry note"
                          className="h-9 md:w-52"
                        />
                        <Button size="sm" type="submit" className="h-9">
                          Retry
                        </Button>
                      </form>
                      <form
                        action={cancelFailedPayout}
                        className="flex w-full gap-2 md:w-auto"
                      >
                        <input
                          type="hidden"
                          name="transactionId"
                          value={tx.id}
                        />
                        <Input
                          name="note"
                          placeholder="Cancel note"
                          className="h-9 md:w-52"
                        />
                        <Button
                          size="sm"
                          type="submit"
                          variant="outline"
                          className="h-9"
                        >
                          Cancel
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>Pending payouts (SLA queue)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Monitor pending payouts and prioritize stale entries.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Contributor</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payoutQueues.pending.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No pending payouts.
                  </TableCell>
                </TableRow>
              )}
              {payoutQueues.pending.map((tx) => (
                <TableRow key={tx.id} className="hover:bg-muted/30">
                  <TableCell className="text-sm">
                    <div>{tx.contributor_name || "Unknown contributor"}</div>
                    <div className="text-xs text-muted-foreground">
                      {tx.contributor_email || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {tx.dataset_title ||
                      tx.dataset_request_id ||
                      "Unknown dataset"}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatMoney(tx.amount, tx.currency)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span
                      className={
                        tx.age_hours >= 24
                          ? "text-amber-700 font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {tx.age_hours}h
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        tx.age_hours >= 24
                          ? "border-amber-400 text-amber-700"
                          : ""
                      }
                    >
                      {tx.age_hours >= 24 ? "stale_pending" : "pending"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>Recent transactions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Latest records from Stripe Connect and wallet ledger
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latest.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No transactions yet.
                  </TableCell>
                </TableRow>
              )}
              {latest.map((tx) => (
                <TableRow key={tx.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium capitalize">
                    {tx.type?.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tx.status === "completed" ? "outline" : "secondary"
                      }
                      className="capitalize"
                    >
                      {tx.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatMoney(tx.amount, tx.currency || "USD")}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {tx.direction}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tx.created_at
                      ? formatDistanceToNow(new Date(tx.created_at), {
                          addSuffix: true,
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
        <div className="rounded-xl bg-muted p-2">{icon}</div>
      </CardContent>
    </Card>
  );
}
