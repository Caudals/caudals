import Link from "next/link";
import { getRequesterBillingOverview } from "@/lib/actions/requester-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";
import { WalletFundingCard } from "@/components/requester/billing/wallet-funding-card";
import { BillingAccountControls } from "@/components/requester/billing/billing-account-controls";
import { FundingCheckoutStatusSync } from "@/components/requester/payments/funding-checkout-status-sync";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const overview = await getRequesterBillingOverview();

  if ("error" in overview) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
        {overview.error}
      </div>
    );
  }

  const wallet = overview.wallet;
  const transactions = overview.transactions;
  const statusFilterRaw = typeof params.status === "string" ? params.status : "all";
  const directionFilterRaw =
    typeof params.direction === "string" ? params.direction : "all";
  const typeFilterRaw = typeof params.type === "string" ? params.type : "all";
  const queryRaw = typeof params.q === "string" ? params.q.trim() : "";
  const allowedStatuses = new Set(["all", "pending", "completed", "failed", "cancelled"]);
  const allowedDirections = new Set(["all", "credit", "debit"]);
  const availableTypes = Array.from(new Set(transactions.map((tx) => tx.type))).sort(
    (a, b) => a.localeCompare(b)
  );
  const statusFilter = allowedStatuses.has(statusFilterRaw)
    ? statusFilterRaw
    : "all";
  const directionFilter = allowedDirections.has(directionFilterRaw)
    ? directionFilterRaw
    : "all";
  const typeFilter =
    typeFilterRaw === "all" || availableTypes.includes(typeFilterRaw)
      ? typeFilterRaw
      : "all";
  const query = queryRaw.toLowerCase();
  const filteredTransactions = transactions.filter((tx) => {
    if (statusFilter !== "all" && tx.status !== statusFilter) {
      return false;
    }
    if (directionFilter !== "all" && tx.direction !== directionFilter) {
      return false;
    }
    if (typeFilter !== "all" && tx.type !== typeFilter) {
      return false;
    }
    if (!query) {
      return true;
    }

    const searchable = [
      tx.type,
      tx.status ?? "",
      tx.direction ?? "",
      tx.reference_id ?? "",
      tx.failure_reason ?? "",
      tx.dataset_request_id ?? "",
      tx.submission_id ?? "",
    ].join(" ").toLowerCase();

    return searchable.includes(query);
  });
  const hasActiveFilters =
    statusFilter !== "all" ||
    directionFilter !== "all" ||
    typeFilter !== "all" ||
    queryRaw.length > 0;

  const availableDollars = (wallet?.available_balance ? wallet.available_balance / 100 : 0);
  const pendingDollars = (wallet?.pending_balance ? wallet.pending_balance / 100 : 0);
  const lifetimeFlow = transactions.reduce((sum, tx) => {
    return sum + (tx.direction === "debit" ? -1 : 1) * tx.amount;
  }, 0) / 100;
  const statusBadgeVariant = (status?: string) => {
    if (status === "completed") return "default";
    if (status === "failed") return "destructive";
    if (status === "cancelled") return "secondary";
    return "outline";
  };
  const normalizeCurrency = (currency?: string) =>
    /^[a-z]{3}$/i.test(currency ?? "") ? (currency ?? "USD").toUpperCase() : "USD";
  const formatTransactionAmount = (amountInCents: number, currency?: string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizeCurrency(currency),
      maximumFractionDigits: 2,
    }).format(amountInCents / 100);

  return (
    <div className="space-y-6">
      <FundingCheckoutStatusSync />
      <RequesterPageHeader
        eyebrow="Billing"
        title="Funding and ledger"
        description="Monitor wallet balances, pending funds, and transaction history used to power your dataset operations."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle>Available balance</CardTitle>
            <CardDescription>Ready to allocate</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${availableDollars.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle>Pending funds</CardTitle>
            <CardDescription>Awaiting settlement</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${pendingDollars.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>Latest 100 records</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{filteredTransactions.length}</p>
            <p className="text-xs text-muted-foreground">
              {transactions.length} total in current window
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
          <CardHeader>
            <CardTitle>Net flow</CardTitle>
            <CardDescription>Credit minus debit (sample window)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${lifetimeFlow.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <WalletFundingCard />
      <BillingAccountControls />
      <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
        <CardHeader>
          <CardTitle>Filter ledger</CardTitle>
          <CardDescription>
            Narrow by status, direction, type, or reference context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4">
            <Input
              name="q"
              placeholder="Search reference, dataset, error…"
              defaultValue={queryRaw}
              className="md:col-span-2"
            />
            <select
              name="status"
              defaultValue={statusFilter}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              name="direction"
              defaultValue={directionFilter}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All directions</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
            <select
              name="type"
              defaultValue={typeFilter}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Apply filters
              </button>
              {hasActiveFilters ? (
                <Link
                  href="/requester/billing"
                  className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-800 -0">
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>Funding, payouts, and operational ledger entries</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Date</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Type</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Scope</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Reference</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Details</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent">Direction</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold bg-transparent text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {hasActiveFilters
                      ? "No transactions match the active filters."
                      : "No transactions yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{tx.type.replaceAll("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(tx.status)} className="capitalize">
                        {tx.status ?? "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {tx.dataset_request_id ? (
                        <Link
                          href={`/requester/datasets/${tx.dataset_request_id}`}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Dataset
                        </Link>
                      ) : tx.submission_id ? (
                        <span className="font-mono text-[11px]">
                          Submission {tx.submission_id.slice(0, 8)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {tx.reference_id ? (
                        <span title={tx.reference_id}>
                          {tx.reference_id.length > 18
                            ? `${tx.reference_id.slice(0, 18)}…`
                            : tx.reference_id}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {tx.failure_reason ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.direction === "debit" ? "secondary" : "default"}>
                        {tx.direction === "debit" ? "Debit" : "Credit"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {(tx.direction === "debit" ? "-" : "+") +
                        formatTransactionAmount(tx.amount, tx.currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
