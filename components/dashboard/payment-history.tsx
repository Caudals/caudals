"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  Download,
  RefreshCcw,
  Wallet,
} from "lucide-react";
import { getUserTransactions } from "@/lib/actions/payment-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";

interface Transaction {
  id: string;
  direction: "credit" | "debit";
  type:
    | "wallet_deposit"
    | "wallet_withdrawal"
    | "dataset_funding"
    | "submission_payout"
    | "platform_fee"
    | "stripe_adjustment"
    | "refund"
    | string;
  amount: number;
  fee_amount?: number | null;
  net_amount?: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  created_at: string;
  metadata?: (Record<string, unknown> & {
    dataset_id?: string;
    submission_id?: string;
  }) | null;
}

interface PaymentHistoryProps {
  limit?: number;
  showExport?: boolean;
}

export function PaymentHistory({ limit = 50, showExport = true }: PaymentHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const toast = useLocaleToast();

  useEffect(() => {
    loadTransactions();
  }, [limit]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const result = await getUserTransactions(limit);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      const transactionData = (result.data || []) as Transaction[];
      setTransactions(transactionData);
    } catch {
      toast.error("Failed to load transaction history");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      // Create CSV content
      const headers = [
        "Date",
        "Direction",
        "Type",
        "Amount",
        "Currency",
        "Status",
        "Dataset / Submission",
        "Transaction ID",
      ];

      const rows = transactions.map((t) => [
        new Date(t.created_at).toLocaleDateString(),
        t.direction,
        t.type,
        t.amount.toString(),
        t.currency,
        t.status,
        (t.metadata?.dataset_id as string | undefined) ??
          (t.metadata?.submission_id as string | undefined) ??
          "",
        t.id,
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      // Download CSV
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payment-history-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Payment history exported successfully!");
    } catch {
      toast.error("Failed to export payment history");
    } finally {
      setExportLoading(false);
    }
  };

  const formatAmount = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTransactionIcon = (
    type: Transaction["type"],
    direction: Transaction["direction"]
  ) => {
    switch (type) {
      case "wallet_deposit":
        return <DollarSign className="h-4 w-4 text-green-600" />;
      case "wallet_withdrawal":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case "dataset_funding":
        return direction === "debit" ? (
          <TrendingDown className="h-4 w-4 text-red-600" />
        ) : (
          <TrendingUp className="h-4 w-4 text-green-600" />
        );
      case "submission_payout":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "refund":
        return <RefreshCcw className="h-4 w-4 text-blue-600" />;
      case "stripe_adjustment":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Wallet className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTransactionColor = (direction: Transaction["direction"]) => {
    return direction === "credit" ? "text-green-600" : "text-red-600";
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading payment history...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Payment History</CardTitle>
          {showExport && transactions.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExport}
              disabled={exportLoading}
            >
              {exportLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length > 0 ? (
          <div className="space-y-4">
            {transactions.map((transaction) => (
              <div 
                key={transaction.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getTransactionIcon(transaction.type, transaction.direction)}
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {transaction.type.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.metadata?.dataset_id
                        ? `Dataset ${transaction.metadata.dataset_id}`
                        : transaction.metadata?.submission_id
                        ? `Submission ${transaction.metadata.submission_id}`
                        : "Stripe transaction"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(transaction.created_at)}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className={`text-sm font-medium ${getTransactionColor(transaction.direction)}`}>
                    {transaction.direction === "debit" ? "-" : "+"}
                    {formatAmount(transaction.amount, transaction.currency)}
                  </p>
                  <Badge 
                    className={`text-xs ${getStatusColor(transaction.status)}`}
                  >
                    {getStatusIcon(transaction.status)}
                    <span className="ml-1">{transaction.status}</span>
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No payment history yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
