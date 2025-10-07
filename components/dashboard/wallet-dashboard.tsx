"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Wallet, 
  DollarSign, 
  TrendingUp, 
  CreditCard,
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { 
  getUserWallet, 
  getUserTransactions, 
  createStripeConnectAccount,
  getStripeConnectAccount 
} from "@/lib/actions/payment-actions";
import { PayoutSystem } from "./payout-system";
import { PaymentHistory } from "./payment-history";

interface WalletData {
  id: string;
  balance: number;
  currency: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  created_at: string;
}

interface StripeAccount {
  id: string;
  stripe_account_id: string;
  status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

export function WalletDashboard() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stripeAccount, setStripeAccount] = useState<StripeAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    setLoading(true);
    try {
      const [walletResult, transactionsResult, accountResult] = await Promise.all([
        getUserWallet(),
        getUserTransactions(10),
        getStripeConnectAccount()
      ]);

      if (walletResult.data) setWallet(walletResult.data);
      if (transactionsResult.data) setTransactions(transactionsResult.data);
      if (accountResult.data) setStripeAccount(accountResult.data);
    } catch {
      toast.error("Failed to load wallet data");
    } finally {
      setLoading(false);
    }
  };

  const handleStripeOnboarding = async () => {
    setOnboardingLoading(true);
    try {
      const result = await createStripeConnectAccount();
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.data?.onboarding_url) {
        // Redirect to Stripe onboarding
        window.location.href = result.data.onboarding_url;
      } else {
        toast.success("Stripe account already set up!");
        loadWalletData(); // Refresh data
      }
    } catch {
      toast.error("Failed to create Stripe account");
    } finally {
      setOnboardingLoading(false);
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

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "deposit":
      case "payout":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "withdrawal":
      case "payment":
        return <TrendingUp className="h-4 w-4 text-red-600" />;
      case "commission":
        return <DollarSign className="h-4 w-4 text-orange-600" />;
      default:
        return <Wallet className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case "deposit":
      case "payout":
        return "text-green-600";
      case "withdrawal":
      case "payment":
        return "text-red-600";
      case "commission":
        return "text-orange-600";
      default:
        return "text-gray-600";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading wallet...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Wallet Balance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {wallet ? formatAmount(wallet.balance, wallet.currency) : "$0.00"}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Available for withdrawal
          </p>
        </CardContent>
      </Card>

      {/* Payout System */}
      <PayoutSystem onPayoutSuccess={loadWalletData} />

      {/* Stripe Connect Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Setup
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stripeAccount ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Stripe Account</span>
                <Badge 
                  variant={stripeAccount.payouts_enabled ? "default" : "secondary"}
                  className={stripeAccount.payouts_enabled ? "bg-green-500" : ""}
                >
                  {stripeAccount.payouts_enabled ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Pending
                    </>
                  )}
                </Badge>
              </div>
              
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Charges: {stripeAccount.charges_enabled ? "Enabled" : "Disabled"}</p>
                <p>Payouts: {stripeAccount.payouts_enabled ? "Enabled" : "Disabled"}</p>
                <p>Details: {stripeAccount.details_submitted ? "Submitted" : "Pending"}</p>
              </div>

              {!stripeAccount.payouts_enabled && (
                <Button 
                  onClick={handleStripeOnboarding}
                  disabled={onboardingLoading}
                  className="w-full"
                >
                  {onboardingLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Complete Setup
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No payment account set up</p>
                <p className="text-xs text-muted-foreground">
                  Set up your account to receive payments
                </p>
              </div>
              <Button 
                onClick={handleStripeOnboarding}
                disabled={onboardingLoading}
                className="w-full"
              >
                {onboardingLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Set Up Payments
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <PaymentHistory limit={10} showExport={false} />
    </div>
  );
}
