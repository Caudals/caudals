"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getUserTransactions } from "@/lib/actions/payment-actions";

interface BillingOverviewProps {
  onAddFunds?: () => void;
}

export function BillingOverview({ onAddFunds }: BillingOverviewProps) {
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    setLoading(true);
    try {
      const result = await getUserTransactions(100);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      const transactions = result.data || [];
      const spent = transactions
        .filter(t => t.type === "payment" && t.status === "completed")
        .reduce((sum, t) => sum + t.amount, 0);

      setTotalSpent(spent);
    } catch {
      toast.error("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading billing data...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Total Spent</CardTitle>
          <CardDescription>
            Total amount spent on dataset collection rewards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-4xl font-bold">{formatAmount(totalSpent)}</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onAddFunds}>
                <Plus className="mr-2 h-4 w-4" />
                Add Funds
              </Button>
              <Button size="sm" variant="outline" onClick={loadBillingData}>
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>Stripe payment processing</CardDescription>
            </div>
            <CreditCard className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-14 items-center justify-center rounded-md border bg-card">
                  <span className="text-xs font-bold">STRIPE</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Secure Payment Processing</p>
                  <p className="text-xs text-muted-foreground">Powered by Stripe</p>
                </div>
              </div>
              <Badge variant="outline">Active</Badge>
            </div>
            <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <p className="text-xs text-green-800">
                All payments are processed securely through Stripe
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

