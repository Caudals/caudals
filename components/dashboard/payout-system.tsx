"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Wallet,
  DollarSign,
  TrendingUp,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  getUserWallet,
  getStripeConnectAccount,
} from "@/lib/actions/payment-actions";

interface PayoutSystemProps {
  onPayoutSuccess?: () => void;
}

export function PayoutSystem({ onPayoutSuccess }: PayoutSystemProps) {
  const [wallet, setWallet] = useState<{
    id: string;
    balance: number;
    currency: string;
  } | null>(null);
  const [stripeAccount, setStripeAccount] = useState<{
    id: string;
    stripe_account_id: string;
    status: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [payoutLoading, setPayoutLoading] = useState(false);

  useEffect(() => {
    loadPayoutData();
  }, []);

  const loadPayoutData = async () => {
    setLoading(true);
    try {
      const [walletResult, accountResult] = await Promise.all([
        getUserWallet(),
        getStripeConnectAccount(),
      ]);

      if (walletResult.data) setWallet(walletResult.data);
      if (accountResult.data) setStripeAccount(accountResult.data);
    } catch {
      toast.error("Failed to load payout data");
    } finally {
      setLoading(false);
    }
  };

  const handlePayout = async () => {
    if (!wallet || wallet.balance <= 0) {
      toast.error("No funds available for payout");
      return;
    }

    if (!stripeAccount?.payouts_enabled) {
      toast.error("Stripe account not ready for payouts");
      return;
    }

    setPayoutLoading(true);
    try {
      // Note: Payouts are now automatic via Stripe Connect when submissions are approved
      // This manual payout is for any remaining wallet balance
      toast.info(
        "Automatic payouts are handled by Stripe Connect when your submissions are approved. Your wallet balance is for reference only."
      );
      onPayoutSuccess?.();
      await loadPayoutData();
    } catch {
      toast.error("Failed to load payout information");
    } finally {
      setPayoutLoading(false);
    }
  };

  const formatAmount = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const getAccountStatusBadge = () => {
    if (!stripeAccount) {
      return <Badge variant="destructive">Not Set Up</Badge>;
    }

    if (stripeAccount.payouts_enabled) {
      return <Badge className="bg-green-500">Ready for Payouts</Badge>;
    } else if (stripeAccount.details_submitted) {
      return <Badge className="bg-yellow-500">Pending Verification</Badge>;
    } else {
      return <Badge variant="destructive">Setup Required</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading payout information...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Wallet Balance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Available Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-3xl font-bold">
              {wallet ? formatAmount(wallet.balance, wallet.currency) : "$0.00"}
            </div>
            <p className="text-sm text-muted-foreground">
              Funds available for withdrawal
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stripe Account Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Payment Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Account Status</span>
              {getAccountStatusBadge()}
            </div>

            {stripeAccount && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Charges:</span>
                  <span>
                    {stripeAccount.charges_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Payouts:</span>
                  <span>
                    {stripeAccount.payouts_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Details:</span>
                  <span>
                    {stripeAccount.details_submitted ? "Submitted" : "Pending"}
                  </span>
                </div>
              </div>
            )}

            {!stripeAccount?.payouts_enabled && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <p className="text-sm text-yellow-800">
                  Complete your Stripe account setup to enable payouts
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payout Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Withdraw Funds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {wallet && wallet.balance > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-800">
                    You have {formatAmount(wallet.balance)} available for
                    withdrawal
                  </p>
                </div>

                <div className="text-sm text-center text-muted-foreground p-4 bg-blue-50 rounded-lg">
                  <p className="font-medium text-blue-900">
                    Automatic Payouts Enabled
                  </p>
                  <p className="mt-1 text-xs text-blue-800">
                    Earnings are automatically transferred to your bank account
                    when submissions are approved. Wallet balance shown is for
                    tracking purposes only.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No funds available for withdrawal
                </p>
              </div>
            )}

            {/* Payout Info */}
            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="font-medium">Payout Information:</p>
              <ul className="space-y-1">
                <li>
                  • <strong>Automatic payouts</strong> when submissions are
                  approved
                </li>
                <li>
                  • Funds transferred directly to your bank via Stripe Connect
                </li>
                <li>• 10% platform fee deducted automatically</li>
                <li>• Payouts arrive in 1-2 business days</li>
                <li>• Track your earnings in transaction history</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
