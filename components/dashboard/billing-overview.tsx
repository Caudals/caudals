import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BillingOverview() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">No billing activity yet.</p>
        <p className="text-lg font-semibold">Current balance: $0.00</p>
      </CardContent>
    </Card>
  );
}
