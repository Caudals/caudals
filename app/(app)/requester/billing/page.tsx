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
    <div className="space-y-6 pb-10">
      <FundingCheckoutStatusSync />
      <RequesterPageHeader
        title="Funding & Ledger"
        description="Monitor wallet balances, pending funds, and transaction history used to power your dataset operations."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-none border-border bg-emerald-50/50 rounded-2xl">
          <CardHeader className="pb-2 border-b border-emerald-100/50 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Available Balance</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-bold text-emerald-700">${availableDollars.toLocaleString()}</p>
            <p className="text-[11px] text-emerald-700/80 font-medium mt-1">Ready to allocate</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-amber-50/50 rounded-2xl">
          <CardHeader className="pb-2 border-b border-amber-100/50 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Pending Funds</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-bold text-amber-700">${pendingDollars.toLocaleString()}</p>
            <p className="text-[11px] text-amber-700/80 font-medium mt-1">Awaiting settlement</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="pb-2 border-b border-slate-200 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-bold text-foreground">{filteredTransactions.length}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {transactions.length} total in current window
            </p>
          </CardContent>
        </Card>
        
        <Card className="shadow-none border-border bg-background rounded-2xl">
          <CardHeader className="pb-2 border-b border-slate-200 mx-2 mt-2 mb-3">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Net Flow</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-bold text-foreground">${lifetimeFlow.toLocaleString()}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Credit minus debit</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <WalletFundingCard />
        <BillingAccountControls />
      </div>

      <div className="flex flex-col gap-4">
        <form className="flex flex-wrap items-center gap-3 bg-muted/30 p-3 rounded-2xl border border-border">
          <Input
            name="q"
            placeholder="Search reference, dataset..."
            defaultValue={queryRaw}
            className="h-9 w-full md:w-auto md:min-w-[250px] shadow-none rounded-lg"
          />
          <div className="flex-1 grid grid-cols-2 md:flex md:flex-row gap-2">
            <select
              name="status"
              defaultValue={statusFilter}
              className="h-9 w-full md:w-auto min-w-[140px] rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
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
              className="h-9 w-full md:w-auto min-w-[140px] rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
            >
              <option value="all">All directions</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
            <select
              name="type"
              defaultValue={typeFilter}
              className="h-9 w-full md:w-auto min-w-[140px] rounded-lg border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
            >
              <option value="all">All types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto ml-auto">
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-none hover:bg-[var(--accent)]/90 transition-colors"
            >
              Apply filters
            </button>
            {hasActiveFilters ? (
              <Link
                href="/requester/billing"
                className="text-sm text-slate-500 px-2 hover:text-foreground"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <Card className="shadow-none border-slate-200 bg-white rounded-2xl overflow-hidden py-0 gap-0">
          <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
            <CardTitle className="text-base">Transaction history</CardTitle>
            <CardDescription>Funding, payouts, and operational ledger entries</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">Date</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Type</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Status</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Scope</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Reference</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Details</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Direction</TableHead>
                  <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                      {hasActiveFilters
                        ? "No transactions match the active filters."
                        : "No transactions yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                      <TableCell className="pl-8 py-4 text-sm whitespace-nowrap text-slate-500">{new Date(tx.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="capitalize py-4 text-sm font-medium text-slate-900">{tx.type.replaceAll("_", " ")}</TableCell>
                      <TableCell className="py-4">
                        <Badge 
                          variant="secondary" 
                          className={`shadow-none font-semibold text-[10px] uppercase tracking-wider px-2 py-0.5 border ${
                            tx.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            tx.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                            tx.status === 'cancelled' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {tx.status ?? "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm py-4">
                        {tx.dataset_request_id ? (
                          <Link
                            href={`/requester/datasets/${tx.dataset_request_id}`}
                            className="font-medium text-[var(--accent)] hover:underline"
                          >
                            Dataset
                          </Link>
                        ) : tx.submission_id ? (
                          <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">
                            {tx.submission_id.slice(0, 8)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        {tx.reference_id ? (
                          <span title={tx.reference_id} className="font-mono text-xs text-slate-500">
                            {tx.reference_id.length > 18
                              ? `${tx.reference_id.slice(0, 18)}…`
                              : tx.reference_id}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs text-slate-500 py-4">
                        {tx.failure_reason ?? "—"}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className={`shadow-none border-slate-200 text-[10px] uppercase tracking-wider font-bold ${tx.direction === 'debit' ? 'bg-slate-50 text-slate-500' : 'bg-[var(--accent)]/10 text-[var(--accent-foreground)] border-transparent'}`}>
                          {tx.direction === "debit" ? "Debit" : "Credit"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right py-4 pr-8">
                        <span className={`font-bold ${tx.direction === 'debit' ? 'text-slate-900' : 'text-emerald-600'}`}>
                          {(tx.direction === "debit" ? "-" : "+") +
                            formatTransactionAmount(tx.amount, tx.currency)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
