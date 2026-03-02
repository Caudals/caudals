import { getRequesterBillingOverview } from "@/lib/actions/requester-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RequesterPageHeader } from "@/components/requester/requester-page-header";

export default async function BillingPage() {
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

  const availableDollars = (wallet?.available_balance ? wallet.available_balance / 100 : 0);
  const pendingDollars = (wallet?.pending_balance ? wallet.pending_balance / 100 : 0);
  const lifetimeFlow = transactions.reduce((sum, tx) => {
    return sum + (tx.direction === "debit" ? -1 : 1) * tx.amount;
  }, 0) / 100;

  return (
    <div className="space-y-6">
      <RequesterPageHeader
        eyebrow="Billing"
        title="Funding and ledger"
        description="Monitor wallet balances, pending funds, and transaction history used to power your dataset operations."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Available balance</CardTitle>
            <CardDescription>Ready to allocate</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${availableDollars.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending funds</CardTitle>
            <CardDescription>Awaiting settlement</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${pendingDollars.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>Latest 100 records</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{transactions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Net flow</CardTitle>
            <CardDescription>Credit minus debit (sample window)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${lifetimeFlow.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>Funding, payouts, and operational ledger entries</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{new Date(tx.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="capitalize">{tx.type.replaceAll("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {tx.status ?? "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.direction === "debit" ? "secondary" : "default"}>
                        {tx.direction === "debit" ? "Debit" : "Credit"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {(tx.direction === "debit" ? "-" : "+") + `$${(tx.amount / 100).toLocaleString()}`}
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
