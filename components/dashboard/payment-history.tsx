import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ArrowUpRight, ArrowDownLeft } from "lucide-react";

export function PaymentHistory() {
  const transactions = [
    {
      id: "1",
      type: "deposit",
      description: "Account deposit",
      amount: "+$500.00",
      date: "2024-01-28",
      status: "completed",
    },
    {
      id: "2",
      type: "payment",
      description: "Dataset rewards - Street Scene Images",
      amount: "-$585.00",
      date: "2024-01-25",
      status: "completed",
    },
    {
      id: "3",
      type: "payment",
      description: "Dataset rewards - Voice Samples",
      amount: "-$462.50",
      date: "2024-01-22",
      status: "completed",
    },
    {
      id: "4",
      type: "deposit",
      description: "Account deposit",
      amount: "+$1,000.00",
      date: "2024-01-20",
      status: "completed",
    },
    {
      id: "5",
      type: "payment",
      description: "Dataset rewards - Medical Images",
      amount: "-$375.00",
      date: "2024-01-18",
      status: "completed",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              Your recent deposits and reward payments
            </CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    transaction.type === "deposit"
                      ? "bg-emerald-500/10"
                      : "bg-blue-500/10"
                  }`}
                >
                  {transaction.type === "deposit" ? (
                    <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {transaction.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {transaction.date}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-semibold ${
                    transaction.type === "deposit"
                      ? "text-emerald-600"
                      : "text-foreground"
                  }`}
                >
                  {transaction.amount}
                </span>
                <Badge variant="outline" className="text-emerald-600">
                  {transaction.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
