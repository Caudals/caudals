import React from "react";
import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  getAdminPaymentAnomalies,
  getAdminPaymentComplianceRecords,
  getAdminPaymentsOverview,
  getAdminPayoutQueues,
  reconcilePayoutTransaction,
  upsertAdminPaymentComplianceRecord,
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
import { Checkbox } from "@/components/ui/checkbox";
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

  const [overviewRes, queueRes, anomalyRes, complianceRes] = await Promise.all([
    getAdminPaymentsOverview(),
    getAdminPayoutQueues(),
    getAdminPaymentAnomalies(),
    getAdminPaymentComplianceRecords(),
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
        <Card className="border-destructive/40 bg-destructive/5 shadow-none">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">
                Unable to load payments
              </p>
              <p className="text-sm text-slate-500">{loadError}</p>
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
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        title="Payment Operations"
        description="Reconcile payout failures, monitor queue age, and keep transfer SLAs healthy."
        actions={
          <>
            <Button asChild variant="outline" className="shadow-none rounded-lg">
              <Link
                href="/admin/support?tPriority=urgent"
                data-dashboard-action="admin_payments_open_support_escalations"
              >
                Escalation queue
              </Link>
            </Button>
            <Button variant="outline" className="shadow-none rounded-lg">
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
          icon={<ArrowDownRight className="h-4 w-4 text-slate-500" />}
        />
        <StatCard
          label="Pending payouts"
          value={totals.pendingPayouts.toString()}
          icon={<Wallet className="h-4 w-4 text-amber-600" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 shadow-none bg-white rounded-2xl">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Failed payout queue</p>
            <p className="mt-2 text-3xl font-bold text-destructive">
              {payoutQueues.totals.failedCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-none bg-white rounded-2xl">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Pending payout queue
            </p>
            <p className="mt-2 text-3xl font-bold text-foreground">
              {payoutQueues.totals.pendingCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-none bg-white rounded-2xl">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Stale pending (24h+)
            </p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              {payoutQueues.totals.stalePendingCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-2 rounded-xl border border-border">
        <Button
          asChild
          size="sm"
          variant={failedFilter === "all" ? "secondary" : "ghost"}
          className={`rounded-lg ${failedFilter === "all" ? "shadow-sm bg-background border border-border" : ""}`}
        >
          <Link href={filterHref({ failed: "all" })}>All failed</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={failedFilter === "high_value" ? "secondary" : "ghost"}
          className={`rounded-lg ${failedFilter === "high_value" ? "shadow-sm bg-background border border-border text-amber-700" : ""}`}
        >
          <Link href={filterHref({ failed: "high_value" })}>
            High value (&gt;$100)
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={failedFilter === "repeated" ? "secondary" : "ghost"}
          className={`rounded-lg ${failedFilter === "repeated" ? "shadow-sm bg-background border border-border text-destructive" : ""}`}
        >
          <Link href={filterHref({ failed: "repeated" })}>
            Repeated failures
          </Link>
        </Button>
        <div className="w-px h-4 bg-border mx-1"></div>
        <Button
          asChild
          size="sm"
          variant={pendingFilter === "all" ? "secondary" : "ghost"}
          className={`rounded-lg ${pendingFilter === "all" ? "shadow-sm bg-background border border-border" : ""}`}
        >
          <Link href={filterHref({ pending: "all" })}>All pending</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={pendingFilter === "stale" ? "secondary" : "ghost"}
          className={`rounded-lg ${pendingFilter === "stale" ? "shadow-sm bg-background border border-border text-amber-700" : ""}`}
        >
          <Link href={filterHref({ pending: "stale" })}>Stale (24h+)</Link>
        </Button>
        <div className="w-px h-4 bg-border mx-1 hidden md:block"></div>
        <Button
          asChild
          size="sm"
          variant={anomalyFilter === "all" ? "secondary" : "ghost"}
          className={`rounded-lg hidden md:flex ${anomalyFilter === "all" ? "shadow-sm bg-background border border-border" : ""}`}
        >
          <Link href={filterHref({ anomaly: "all" })}>All anomalies</Link>
        </Button>
      </div>

      <Card className="border-slate-200 shadow-none rounded-2xl overflow-hidden bg-white py-0 gap-0">
        <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
          <CardTitle className="text-lg">Unified payment anomalies</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            Correlates payout transactions, transfer references, and webhook processing state.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid gap-0 md:grid-cols-4 border-b border-slate-200 bg-slate-50/50">
            <div className="p-4 border-b md:border-b-0 md:border-r border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total anomalies</p>
              <p className="text-2xl font-bold mt-1 text-slate-900">{anomaliesOverview.totals.total}</p>
            </div>
            <div className="p-4 border-b md:border-b-0 md:border-r border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">High severity</p>
              <p className="text-2xl font-bold mt-1 text-red-600">
                {anomaliesOverview.totals.high}
              </p>
            </div>
            <div className="p-4 border-b md:border-b-0 md:border-r border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Transfer-linked</p>
              <p className="text-2xl font-bold mt-1 text-slate-900">{anomaliesOverview.totals.transfer}</p>
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Webhook-linked</p>
              <p className="text-2xl font-bold mt-1 text-slate-900">{anomaliesOverview.totals.webhook}</p>
            </div>
          </div>

          {!anomaliesOverview.webhookLedgerAvailable ? (
            <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <p>
                <span className="font-semibold">`stripe_webhook_events` is unavailable.</span> Webhook anomaly correlation is running in fallback mode.
              </p>
            </div>
          ) : null}

          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">Severity</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Category</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Signal</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Entity</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Detected</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomalyRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-sm text-slate-500"
                  >
                    No anomalies in current filter.
                  </TableCell>
                </TableRow>
              ) : null}
              {anomalyRows.map((row) => (
                <TableRow key={row.id} className="align-top hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                  <TableCell className="pt-4 pl-8">
                    <Badge
                      variant="secondary"
                      className={`shadow-none font-semibold text-[10px] uppercase tracking-wider ${
                        row.severity === "high"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : row.severity === "medium"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {row.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="pt-4 font-mono text-[11px] text-slate-500">{row.category}</TableCell>
                  <TableCell className="pt-4 max-w-sm">
                    <div className="font-medium text-sm text-slate-900">{row.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{row.description}</div>
                  </TableCell>
                  <TableCell className="pt-4">
                    <div className="text-sm font-medium text-slate-900">{row.dataset_title || row.dataset_request_id || "—"}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {row.contributor_name || row.contributor_email || row.reference_id || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="pt-4 text-xs text-slate-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(row.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="pt-4 text-right pr-8">
                    <Button asChild size="sm" variant="outline" className="shadow-none rounded-lg h-8 px-3 border-slate-200">
                      <Link href={row.quick_link}>Investigate</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 shadow-none rounded-2xl overflow-hidden bg-white py-0 gap-0">
          <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
            <CardTitle className="text-lg">Recent transactions</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              Latest records from Stripe Connect
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">Type</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Status</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center py-6 text-sm text-slate-500"
                    >
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                )}
                {latest.map((tx) => {
                  const complianceRecord = complianceByTransaction.get(tx.id);
                  const hasComplianceRecord = Boolean(complianceRecord);

                  return (
                    <TableRow key={tx.id} className="hover:bg-slate-50/50 group transition-colors border-slate-200 bg-white">
                      <TableCell className="pl-8 py-3">
                        <div className="font-medium capitalize text-sm text-slate-900">
                          {tx.type?.replace("_", " ")}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-slate-500 capitalize">
                            {tx.direction}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="text-[11px] text-slate-500">
                            {tx.created_at ? formatDistanceToNow(new Date(tx.created_at), { addSuffix: true }) : "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant="secondary"
                          className={`shadow-none font-semibold text-[10px] uppercase tracking-wider border ${
                            tx.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8 py-3">
                        <div className="font-semibold text-sm text-slate-900">
                          {formatMoney(tx.amount, tx.currency || "USD")}
                        </div>
                        <div className="mt-1 flex justify-end gap-1">
                          <Badge
                            variant="secondary"
                            className={`shadow-none font-semibold text-[9px] uppercase px-1.5 py-0 border ${
                              hasComplianceRecord ? "bg-emerald-50/50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {hasComplianceRecord ? "Cmpl" : "No Cmpl"}
                          </Badge>
                          <Button asChild size="sm" variant="ghost" className="h-4 text-[10px] px-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500">
                            <Link href={filterHref({ complianceTx: tx.id })}>
                              Edit
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none rounded-2xl flex flex-col bg-white">
          <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
            <CardTitle className="text-lg flex justify-between items-center">
              <span>Compliance registry</span>
              <Badge variant="outline" className="font-mono text-xs border-slate-200 bg-white">{selectedComplianceTxId ? selectedComplianceTxId.substring(0, 12) + "..." : "Select TX"}</Badge>
            </CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              Capture tax/legal references for enterprise finance.
            </p>
          </CardHeader>
          <CardContent className="p-5 flex-1 flex flex-col">
            {!complianceOverview.tableAvailable ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 mb-4">
                `payment_compliance_records` table is missing. Apply migration
                `025_payment_compliance_records.sql` to enable compliance workflows.
              </div>
            ) : null}

            {selectedComplianceTransaction ? (
              <form
                action={saveComplianceRecord}
                className="flex-1 flex flex-col gap-4"
              >
                <input
                  type="hidden"
                  name="transactionId"
                  value={selectedComplianceTransaction.id}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">Entity Name</label>
                    <Input
                      name="legalEntityName"
                      placeholder="e.g. Acme Corp"
                      defaultValue={selectedComplianceRecord?.legal_entity_name ?? ""}
                      className="shadow-none rounded-lg h-9 bg-slate-50 border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">Country (ISO)</label>
                    <Input
                      name="legalEntityCountry"
                      placeholder="US"
                      maxLength={2}
                      defaultValue={selectedComplianceRecord?.legal_entity_country ?? ""}
                      className="shadow-none rounded-lg h-9 bg-slate-50 border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">Tax Reference</label>
                    <Input
                      name="taxReference"
                      placeholder="EIN/TIN"
                      defaultValue={selectedComplianceRecord?.tax_reference ?? ""}
                      className="shadow-none rounded-lg h-9 bg-slate-50 border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">VAT Reference</label>
                    <Input
                      name="vatReference"
                      placeholder="VAT Number"
                      defaultValue={selectedComplianceRecord?.vat_reference ?? ""}
                      className="shadow-none rounded-lg h-9 bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>

                <div className="space-y-1 mt-2">
                  <label className="text-xs font-semibold text-slate-500">Internal Notes</label>
                  <textarea
                    name="notes"
                    placeholder="Add audit notes or context here..."
                    defaultValue={selectedComplianceRecord?.notes ?? ""}
                    className="w-full min-h-[100px] rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm shadow-none focus:ring-2 focus:ring-ring focus:outline-none"
                  />
                </div>

                <div className="mt-auto pt-4 flex items-center justify-between border-t border-slate-200">
                  <label className="flex items-center gap-2 text-sm font-medium text-amber-700 cursor-pointer">
                    <Checkbox
                      name="legalHold"
                      defaultChecked={Boolean(selectedComplianceRecord?.legal_hold)}
                      className="border-amber-700/50 data-[state=checked]:bg-amber-700 data-[state=checked]:border-amber-700"
                    />
                    Apply Legal Hold
                  </label>
                  <Button type="submit" size="sm" className="shadow-none rounded-lg px-6">
                    Save Record
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 rounded-xl">
                <CreditCard className="h-8 w-8 text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-900">No transaction selected</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                  Select a transaction from the list to view or edit compliance details.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-none rounded-2xl overflow-hidden bg-white py-0 gap-0">
        <CardHeader className="bg-red-50/50 border-b border-red-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Failed payouts (reconciliation queue)
          </CardTitle>
          <p className="text-sm text-red-600/70 mt-1">
            Retry failed payout transactions or cancel with an audit note.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">Entity</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Amount</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Failed</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Signals</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Reason</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">Resolution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-sm text-slate-500"
                  >
                    No failed payouts requiring action.
                  </TableCell>
                </TableRow>
              )}
              {failedRows.map((tx) => (
                <TableRow key={tx.id} className="align-top hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                  <TableCell className="pl-8 py-4">
                    <div className="font-medium text-sm text-slate-900">{tx.contributor_name || "Unknown contributor"}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 max-w-[200px] truncate">
                      {tx.dataset_title || tx.dataset_request_id || "Unknown dataset"}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-sm py-4 text-slate-900">
                    {formatMoney(tx.amount, tx.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 py-4">
                    {formatDistanceToNow(new Date(tx.updated_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1.5 items-start">
                      {tx.is_repeated_failure ? (
                        <Badge variant="secondary" className="shadow-none font-semibold text-[9px] uppercase px-1.5 py-0 bg-red-50 text-red-700 border border-red-200">
                          repeated
                        </Badge>
                      ) : null}
                      {tx.amount >= highValueThresholdCents ? (
                        <Badge variant="secondary" className="shadow-none font-semibold text-[9px] uppercase px-1.5 py-0 bg-amber-50 text-amber-700 border border-amber-200">
                          high value
                        </Badge>
                      ) : null}
                      {!tx.is_repeated_failure && tx.amount < highValueThresholdCents && (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[200px] py-4 pr-4">
                    {tx.failure_reason || "No explicit reason."}
                  </TableCell>
                  <TableCell className="py-4 pr-8">
                    <div className="flex flex-col gap-2 md:items-end">
                      <form
                        action={retryFailedPayout}
                        className="flex w-full gap-2 md:w-auto"
                      >
                        <input
                          type="hidden"
                          name="transactionId"
                          value={tx.id}
                        />
                        <select
                          name="reasonCode"
                          defaultValue="transient_stripe_error"
                          className="h-8 rounded-md border-slate-200 bg-slate-50 px-2 text-xs md:w-36 focus:ring-2 focus:ring-ring focus:outline-none"
                        >
                          <option value="transient_stripe_error">stripe_error</option>
                          <option value="bank_details_updated">bank_updated</option>
                          <option value="onboarding_completed">onboarding_done</option>
                          <option value="manual_retry">manual_retry</option>
                        </select>
                        <Button size="sm" type="submit" className="h-8 text-xs px-3 shadow-none rounded-md">
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
                        <select
                          name="reasonCode"
                          defaultValue="manual_cancellation"
                          className="h-8 rounded-md border-slate-200 bg-slate-50 px-2 text-xs md:w-36 focus:ring-2 focus:ring-ring focus:outline-none"
                        >
                          <option value="manual_cancellation">manual_cancel</option>
                          <option value="duplicate_payout">duplicate</option>
                          <option value="submission_reversed">reversed</option>
                          <option value="compliance_block">compliance</option>
                        </select>
                        <Button
                          size="sm"
                          type="submit"
                          variant="outline"
                          className="h-8 text-xs px-3 shadow-none rounded-md text-slate-500 border-slate-200"
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
      </div>  );
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
    <Card className="border-border shadow-none rounded-2xl bg-background">
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className="rounded-full bg-muted/50 p-3 border border-slate-200">{icon}</div>
      </CardContent>
    </Card>
  );
}
