import { getRequesterBillingOverview } from "@/lib/actions/requester-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Billing</p>
        <h1 className="text-2xl font-semibold">Funding & ledger</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Wallet balance</CardTitle>
            <CardDescription>Available funds</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              ${(wallet?.available_balance ? wallet.available_balance / 100 : 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              ${(wallet?.pending_balance ? wallet.pending_balance / 100 : 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{transactions.length}</p>
            <p className="text-xs text-muted-foreground">last 100 entries</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{new Date(tx.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{tx.type}</TableCell>
                    <TableCell>{tx.status}</TableCell>
                    <TableCell className="text-right">
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
