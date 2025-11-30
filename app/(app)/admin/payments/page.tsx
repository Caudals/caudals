import React from "react";
import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminPaymentsOverview } from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, ArrowDownRight, ArrowUpRight, CreditCard, Download, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const result = await getAdminPaymentsOverview();

  if ("error" in result) {
    return (
      <div className="space-y-4">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Unable to load payments</p>
              <p className="text-sm text-muted-foreground">
                {result.error || "Please try again later."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { totals, transactions } = result.data;

  const formatMoney = (amount: number | null | undefined, currency = "USD") =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      Number(amount || 0) / 100
    );

  const latest = transactions.slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Payment Overview</h1>
          <p className="text-sm text-muted-foreground">
            Manage platform financial transactions and balances
          </p>
        </div>
        <Download className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total volume"
          value={formatMoney(totals.totalVolume)}
          icon={<CreditCard className="h-4 w-4 text-emerald-600" />}
        />
        <StatCard
          label="Platform commission"
          value={formatMoney(totals.platformCommission)}
          icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
        />
        <StatCard
          label="Payouts sent"
          value={formatMoney(totals.payoutVolume)}
          icon={<ArrowDownRight className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Pending payouts"
          value={totals.pendingPayouts.toString()}
          icon={<Wallet className="h-4 w-4 text-amber-600" />}
        />
      </div>

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
                  <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
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
                      variant={tx.status === "completed" ? "outline" : "secondary"}
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
                      ? formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })
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
