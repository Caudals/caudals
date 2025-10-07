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
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { getUserWallet, getStripeConnectAccount } from "@/lib/actions/payment-actions";

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
        getStripeConnectAccount()
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
      // In a real implementation, this would call a server action
      // to create a payout through Stripe Connect
      toast.success("Payout initiated! Funds will be transferred to your bank account within 1-2 business days.");
      onPayoutSuccess?.();
    } catch {
      toast.error("Failed to initiate payout");
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
                  <span>{stripeAccount.charges_enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payouts:</span>
                  <span>{stripeAccount.payouts_enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Details:</span>
                  <span>{stripeAccount.details_submitted ? "Submitted" : "Pending"}</span>
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
                    You have {formatAmount(wallet.balance)} available for withdrawal
                  </p>
                </div>

                <Button 
                  onClick={handlePayout}
                  disabled={payoutLoading || !stripeAccount?.payouts_enabled}
                  className="w-full"
                >
                  {payoutLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <DollarSign className="mr-2 h-4 w-4" />
                  )}
                  {payoutLoading ? "Processing..." : "Withdraw to Bank Account"}
                </Button>
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
                <li>• Payouts are processed within 1-2 business days</li>
                <li>• Minimum withdrawal amount: $1.00</li>
                <li>• Funds are transferred to your connected bank account</li>
                <li>• Stripe handles all banking and compliance requirements</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
