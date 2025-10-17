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
import { getUserTransactions, getUserWallet } from "@/lib/actions/payment-actions";
import { PaymentForm } from "./payment-form";

interface BillingOverviewProps {
  onAddFunds?: () => void;
}

export function BillingOverview({ onAddFunds }: BillingOverviewProps) {
  const [totalSpent, setTotalSpent] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    setLoading(true);
    try {
      const transactionsResult = await getUserTransactions(100);
      
      if (transactionsResult.error) {
        toast.error(transactionsResult.error);
        return;
      }

      const transactions = transactionsResult.data || [];
      const spent = transactions
        .filter(
          (t) =>
            t.type === "dataset_funding" &&
            t.direction === "debit" &&
            t.status === "completed"
        )
        .reduce((sum, t) => sum + (t.amount ?? 0), 0);

      setTotalSpent(spent);

      // Load wallet balance
      const walletResult = await getUserWallet();
      
      if (walletResult.error) {
        console.error("Error loading wallet:", walletResult.error);
        setWalletBalance(0);
        setPendingBalance(0);
      } else {
        setWalletBalance(walletResult.data?.available_balance || 0);
        setPendingBalance(walletResult.data?.pending_balance || 0);
      }
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

  const totalBalanceDisplay = formatAmount(walletBalance);
  const pendingBalanceDisplay = pendingBalance > 0 ? formatAmount(pendingBalance) : null;

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
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Wallet Balance</CardTitle>
          <CardDescription>
            Available funds ready to allocate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-4xl font-bold text-green-600">{totalBalanceDisplay}</div>
            {pendingBalanceDisplay && (
              <p className="text-xs text-muted-foreground">
                Pending clearance: {pendingBalanceDisplay}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowPaymentForm(true)}>
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
          <CardTitle>Total Spent</CardTitle>
          <CardDescription>
            Total amount spent on dataset collection rewards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-4xl font-bold">{formatAmount(totalSpent)}</div>
            <div className="text-sm text-muted-foreground">
              All time spending
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

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Add Funds to Wallet</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowPaymentForm(false)}
                >
                  ×
                </Button>
              </div>
              <PaymentForm
                datasetId="wallet-funding"
                datasetTitle="Wallet Funding"
                currentBudget={0}
                onPaymentSuccess={() => {
                  setShowPaymentForm(false);
                  toast.success("Funds added to wallet successfully!");
                  loadBillingData(); // This will refresh both transactions and wallet balance
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
