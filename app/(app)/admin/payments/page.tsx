import React from "react";
import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  getAdminPaymentAnomalies,
  getAdminPaymentComplianceRecords,
  getAdminOperationalHealthStatus,
  getAdminPaymentsOverview,
  getAdminPayoutQueues,
  reconcilePayoutTransaction,
  upsertAdminPaymentComplianceRecord,
} from "@/lib/actions/admin-actions";
import { OperationalHealthStrip } from "@/components/admin/operational-health-strip";
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

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const failedFilterRaw = typeof params.failed === "string" ? params.failed : "all";
  const pendingFilterRaw =
    typeof params.pending === "string" ? params.pending : "all";
  const anomalyFilterRaw =
    typeof params.anomaly === "string" ? params.anomaly : "all";
  const complianceTxRaw =
    typeof params.compliance_tx === "string" ? params.compliance_tx : "";
  const failedFilter = ["all", "high_value", "repeated"].includes(failedFilterRaw)
    ? failedFilterRaw
    : "all";
  const pendingFilter = ["all", "stale"].includes(pendingFilterRaw)
    ? pendingFilterRaw
    : "all";
  const anomalyFilter = ["all", "high", "payout", "transfer", "webhook"].includes(
    anomalyFilterRaw,
  )
    ? anomalyFilterRaw
    : "all";

  const [overviewRes, queueRes, anomalyRes, complianceRes, healthRes] = await Promise.all([
    getAdminPaymentsOverview(),
    getAdminPayoutQueues(),
    getAdminPaymentAnomalies(),
    getAdminPaymentComplianceRecords(),
    getAdminOperationalHealthStatus(),
  ]);

  if (
    "error" in overviewRes ||
    "error" in queueRes ||
    "error" in anomalyRes ||
    "error" in complianceRes
  ) {
    const loadError =
      "error" in overviewRes
        ? overviewRes.error
        : "error" in queueRes
          ? queueRes.error
          : "error" in anomalyRes
            ? anomalyRes.error
            : "error" in complianceRes
              ? complianceRes.error
              : "Please try again later.";

    return (
      <div className="space-y-4">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                Unable to load payments
              </p>
              <p className="text-sm text-muted-foreground">{loadError}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { totals, transactions } = overviewRes.data;
  const payoutQueues = queueRes;
  const anomaliesOverview = anomalyRes;
  const complianceOverview = complianceRes;
  const operationalHealth = "data" in healthRes ? healthRes.data : null;

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
  const highValueThresholdCents = 10000;

  const formatMoney = (amount: number | null | undefined, currency = "USD") =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      Number(amount || 0) / 100,
    );

  const filterHref = (next: {
    failed?: string;
    pending?: string;
    anomaly?: string;
    complianceTx?: string;
  }) => {
    const query = new URLSearchParams();
    const failed = next.failed ?? failedFilter;
    const pending = next.pending ?? pendingFilter;
    const anomaly = next.anomaly ?? anomalyFilter;
    const complianceTx = next.complianceTx ?? complianceTxRaw;
    if (failed !== "all") query.set("failed", failed);
    if (pending !== "all") query.set("pending", pending);
    if (anomaly !== "all") query.set("anomaly", anomaly);
    if (complianceTx) query.set("compliance_tx", complianceTx);
    const queryString = query.toString();
    return queryString ? `/admin/payments?${queryString}` : "/admin/payments";
  };

  const failedRows = payoutQueues.failed
    .filter((row) => {
      if (failedFilter === "high_value") {
        return row.amount >= highValueThresholdCents;
      }
      if (failedFilter === "repeated") {
        return row.is_repeated_failure;
      }
      return true;
    })
    .sort((a, b) =>
      failedFilter === "high_value"
        ? b.amount - a.amount
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  const pendingRows = payoutQueues.pending
    .filter((row) => (pendingFilter === "stale" ? row.age_hours >= 24 : true))
    .sort((a, b) => b.age_hours - a.age_hours);
  const anomalyRows = anomaliesOverview.rows
    .filter((row) => {
      if (anomalyFilter === "high") {
        return row.severity === "high";
      }
      if (anomalyFilter === "payout") {
        return (
          row.category === "stale_pending_payout" ||
          row.category === "failed_payout" ||
          row.category === "repeated_payout_failure"
        );
      }
      if (anomalyFilter === "transfer") {
        return (
          row.category === "missing_transfer_reference" ||
          row.category === "duplicate_transfer_reference" ||
          row.category === "orphan_transfer_event"
        );
      }
      if (anomalyFilter === "webhook") {
        return (
          row.category === "webhook_processing_failed" ||
          row.category === "webhook_processing_stuck" ||
          row.category === "missing_webhook_ledger"
        );
      }
      return true;
    })
    .slice(0, 80);

  const latest = transactions.slice(0, 12);
  const complianceByTransaction = new Map(
    complianceOverview.rows.map((row) => [row.transaction_id, row])
  );
  const selectedComplianceTxId =
    complianceTxRaw ||
    (latest.find((row) => complianceByTransaction.has(row.id))?.id ??
      latest[0]?.id ??
      "");
  const selectedComplianceRecord = selectedComplianceTxId
    ? complianceByTransaction.get(selectedComplianceTxId)
    : undefined;
  const selectedComplianceTransaction = selectedComplianceTxId
    ? transactions.find((tx) => tx.id === selectedComplianceTxId) ?? null
    : null;
  const complianceLegalHoldCount = complianceOverview.rows.filter(
    (row) => row.legal_hold
  ).length;

  const retryFailedPayout = async (formData: FormData) => {
    "use server";
    const transactionId = String(formData.get("transactionId") || "");
    const note = String(formData.get("note") || "");
    const reasonCode = String(formData.get("reasonCode") || "");
    await reconcilePayoutTransaction(transactionId, "pending", note, reasonCode);
  };

  const cancelFailedPayout = async (formData: FormData) => {
    "use server";
    const transactionId = String(formData.get("transactionId") || "");
    const note = String(formData.get("note") || "");
    const reasonCode = String(formData.get("reasonCode") || "");
    await reconcilePayoutTransaction(
      transactionId,
      "cancelled",
      note,
      reasonCode,
    );
  };

  const saveComplianceRecord = async (formData: FormData) => {
    "use server";
    const transactionId = String(formData.get("transactionId") ?? "");
    await upsertAdminPaymentComplianceRecord({
      transactionId,
      legalEntityName: String(formData.get("legalEntityName") ?? ""),
      legalEntityCountry: String(formData.get("legalEntityCountry") ?? ""),
      taxReference: String(formData.get("taxReference") ?? ""),
      vatReference: String(formData.get("vatReference") ?? ""),
      invoiceReference: String(formData.get("invoiceReference") ?? ""),
      purchaseOrderReference: String(formData.get("purchaseOrderReference") ?? ""),
      payoutStatementReference: String(
        formData.get("payoutStatementReference") ?? ""
      ),
      notes: String(formData.get("notes") ?? ""),
      legalHold:
        String(formData.get("legalHold") ?? "").toLowerCase() === "on",
    });
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

      {operationalHealth && <OperationalHealthStrip snapshot={operationalHealth} />}

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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          asChild
          size="sm"
          variant={failedFilter === "all" ? "default" : "outline"}
        >
          <Link href={filterHref({ failed: "all" })}>All failed payouts</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={failedFilter === "high_value" ? "default" : "outline"}
        >
          <Link href={filterHref({ failed: "high_value" })}>
            High value failed (&gt;$100)
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={failedFilter === "repeated" ? "default" : "outline"}
        >
          <Link href={filterHref({ failed: "repeated" })}>
            Repeated failures
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={pendingFilter === "all" ? "secondary" : "outline"}
        >
          <Link href={filterHref({ pending: "all" })}>All pending</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={pendingFilter === "stale" ? "secondary" : "outline"}
        >
          <Link href={filterHref({ pending: "stale" })}>Stale pending (24h+)</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={anomalyFilter === "all" ? "secondary" : "outline"}
        >
          <Link href={filterHref({ anomaly: "all" })}>All anomalies</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={anomalyFilter === "high" ? "secondary" : "outline"}
        >
          <Link href={filterHref({ anomaly: "high" })}>High severity</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={anomalyFilter === "webhook" ? "secondary" : "outline"}
        >
          <Link href={filterHref({ anomaly: "webhook" })}>Webhook signals</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={anomalyFilter === "transfer" ? "secondary" : "outline"}
        >
          <Link href={filterHref({ anomaly: "transfer" })}>Transfer signals</Link>
        </Button>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>Unified payment anomalies</CardTitle>
          <p className="text-sm text-muted-foreground">
            Correlates payout transactions, transfer references, and webhook processing state.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Total anomalies</p>
              <p className="text-xl font-semibold">{anomaliesOverview.totals.total}</p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">High severity</p>
              <p className="text-xl font-semibold text-destructive">
                {anomaliesOverview.totals.high}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Transfer-linked</p>
              <p className="text-xl font-semibold">{anomaliesOverview.totals.transfer}</p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Webhook-linked</p>
              <p className="text-xl font-semibold">{anomaliesOverview.totals.webhook}</p>
            </div>
          </div>

          {!anomaliesOverview.webhookLedgerAvailable ? (
            <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
              `stripe_webhook_events` is unavailable in this environment. Webhook anomaly correlation is running in fallback mode.
            </div>
          ) : null}
        </CardContent>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Severity</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead className="text-right">Drilldown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomalyRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No anomalies in current filter.
                  </TableCell>
                </TableRow>
              ) : null}
              {anomalyRows.map((row) => (
                <TableRow key={row.id} className="align-top hover:bg-muted/30">
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.severity === "high"
                          ? "border-destructive/40 text-destructive"
                          : row.severity === "medium"
                            ? "border-amber-500/50 text-amber-700"
                            : ""
                      }
                    >
                      {row.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.category}</TableCell>
                  <TableCell className="max-w-md text-sm">
                    <div className="font-medium">{row.title}</div>
                    <div className="text-muted-foreground">{row.description}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{row.dataset_title || row.dataset_request_id || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.contributor_name || row.contributor_email || row.reference_id || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(row.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={row.quick_link}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>Compliance metadata registry</CardTitle>
          <p className="text-sm text-muted-foreground">
            Capture tax/legal references for enterprise finance and audit workflows.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Records tracked</p>
              <p className="text-xl font-semibold">
                {complianceOverview.rows.length}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Legal hold flags</p>
              <p className="text-xl font-semibold text-amber-700">
                {complianceLegalHoldCount}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Selected transaction</p>
              <p className="text-sm font-mono">
                {selectedComplianceTxId || "None"}
              </p>
            </div>
          </div>

          {!complianceOverview.tableAvailable ? (
            <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
              `payment_compliance_records` table is missing. Apply migration
              `025_payment_compliance_records.sql` to enable compliance workflows.
            </div>
          ) : null}

          {selectedComplianceTransaction ? (
            <form
              action={saveComplianceRecord}
              className="grid gap-3 rounded-lg border border-border/70 p-4"
            >
              <input
                type="hidden"
                name="transactionId"
                value={selectedComplianceTransaction.id}
              />
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  name="legalEntityName"
                  placeholder="Legal entity name"
                  defaultValue={selectedComplianceRecord?.legal_entity_name ?? ""}
                />
                <Input
                  name="legalEntityCountry"
                  placeholder="Country (ISO-2)"
                  maxLength={2}
                  defaultValue={selectedComplianceRecord?.legal_entity_country ?? ""}
                />
                <Input
                  name="taxReference"
                  placeholder="Tax reference"
                  defaultValue={selectedComplianceRecord?.tax_reference ?? ""}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  name="vatReference"
                  placeholder="VAT reference"
                  defaultValue={selectedComplianceRecord?.vat_reference ?? ""}
                />
                <Input
                  name="invoiceReference"
                  placeholder="Invoice reference"
                  defaultValue={selectedComplianceRecord?.invoice_reference ?? ""}
                />
                <Input
                  name="purchaseOrderReference"
                  placeholder="PO reference"
                  defaultValue={
                    selectedComplianceRecord?.purchase_order_reference ?? ""
                  }
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  name="payoutStatementReference"
                  placeholder="Payout statement reference"
                  defaultValue={
                    selectedComplianceRecord?.payout_statement_reference ?? ""
                  }
                />
                <label className="flex items-center gap-2 rounded-md border border-input px-3 text-sm">
                  <input
                    type="checkbox"
                    name="legalHold"
                    defaultChecked={Boolean(selectedComplianceRecord?.legal_hold)}
                  />
                  Legal hold
                </label>
              </div>
              <textarea
                name="notes"
                placeholder="Compliance notes"
                defaultValue={selectedComplianceRecord?.notes ?? ""}
                className="min-h-20 rounded-md border border-input bg-background p-2 text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Transaction type:{" "}
                  <span className="font-mono">
                    {selectedComplianceTransaction.type ?? "unknown"}
                  </span>
                </p>
                <Button type="submit" size="sm">
                  Save compliance record
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a transaction from the recent ledger table to edit compliance metadata.
            </p>
          )}
        </CardContent>
      </Card>

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
                <TableHead>Signals</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No failed payouts.
                  </TableCell>
                </TableRow>
              )}
              {failedRows.map((tx) => (
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
                  <TableCell className="text-xs">
                    <div className="flex flex-wrap gap-1">
                      {tx.is_repeated_failure ? (
                        <Badge variant="outline" className="text-destructive">
                          repeated
                        </Badge>
                      ) : null}
                      {tx.amount >= highValueThresholdCents ? (
                        <Badge variant="outline" className="text-amber-700">
                          high_value
                        </Badge>
                      ) : null}
                      {tx.is_repeated_failure || tx.amount >= highValueThresholdCents
                        ? null
                        : "—"}
                    </div>
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
                        <select
                          name="reasonCode"
                          defaultValue="transient_stripe_error"
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm md:w-44"
                        >
                          <option value="transient_stripe_error">transient_stripe_error</option>
                          <option value="bank_details_updated">bank_details_updated</option>
                          <option value="onboarding_completed">onboarding_completed</option>
                          <option value="manual_retry">manual_retry</option>
                        </select>
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
                        <select
                          name="reasonCode"
                          defaultValue="manual_cancellation"
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm md:w-44"
                        >
                          <option value="manual_cancellation">manual_cancellation</option>
                          <option value="duplicate_payout">duplicate_payout</option>
                          <option value="submission_reversed">submission_reversed</option>
                          <option value="compliance_block">compliance_block</option>
                        </select>
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
              {pendingRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No pending payouts.
                  </TableCell>
                </TableRow>
              )}
              {pendingRows.map((tx) => (
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
                <TableHead>Compliance</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latest.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No transactions yet.
                  </TableCell>
                </TableRow>
              )}
              {latest.map((tx) => {
                const complianceRecord = complianceByTransaction.get(tx.id);
                const hasComplianceRecord = Boolean(complianceRecord);

                return (
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
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant={hasComplianceRecord ? "outline" : "secondary"}
                          className={hasComplianceRecord ? "text-emerald-700" : ""}
                        >
                          {hasComplianceRecord ? "configured" : "missing"}
                        </Badge>
                        <Button asChild size="sm" variant="ghost" className="h-7 px-1">
                          <Link href={filterHref({ complianceTx: tx.id })}>
                            Edit
                          </Link>
                        </Button>
                      </div>
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
                );
              })}
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
