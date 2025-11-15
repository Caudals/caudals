"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Loader2 } from "lucide-react";
import { getUserWallet } from "@/lib/actions/payment-actions";
import { PaymentHistory } from "./payment-history";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";

interface WalletData {
  id: string;
  balance: number;
  currency: string;
  updated_at: string;
}

export function WalletDashboard() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useLocaleToast();

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    setLoading(true);
    try {
      const walletResult = await getUserWallet();

      if (walletResult.data) setWallet(walletResult.data);
    } catch {
      toast.error("Failed to load wallet data");
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
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

      {/* Payment History */}
      <PaymentHistory limit={10} showExport={false} />
    </div>
  );
}
