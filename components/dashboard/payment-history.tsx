import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PaymentHistory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500">No transactions found.</p>
      </CardContent>
    </Card>
  );
}
