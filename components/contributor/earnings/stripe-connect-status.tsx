"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Shield,
  Wallet2,
  AlertTriangle,
} from "lucide-react";
import {
  getStripeConnectBalance,
  getStripeConnectStatus,
} from "@/lib/actions/payment-actions";
import { StripeOnboardingDialog } from "./stripe-onboarding-dialog";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";

interface ConnectStatus {
  connected: boolean;
  account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: string[];
  bank_last4?: string | null;
  status?: "pending" | "active" | "restricted" | "rejected";
}

interface StripeBalance {
  available: number;
  pending: number;
  currency: string;
}

export function StripeConnectStatus() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [balance, setBalance] = useState<StripeBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const toast = useLocaleToast();

  const loadData = async () => {
    setLoading(true);

    try {
      const [statusResult, balanceResult] = await Promise.all([
        getStripeConnectStatus(),
        getStripeConnectBalance(),
      ]);

      if (statusResult.error) {
        toast.error(statusResult.error);
      } else if (statusResult.data) {
        setStatus(statusResult.data as ConnectStatus);
      }

      if (balanceResult.error) {
        console.warn("Unable to fetch Stripe balance", balanceResult.error);
        setBalance(null);
      } else if (balanceResult.data) {
        setBalance(balanceResult.data as StripeBalance);
      }
    } catch (error) {
      console.error("Failed to load Stripe data", error);
      toast.error("Unable to load Stripe payout information.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleOnboardingCompleted = async () => {
    await loadData();
  };

  const isActive = useMemo(() => {
    if (!status) return false;
    return (
      status.connected &&
      status.details_submitted &&
      status.payouts_enabled &&
      status.charges_enabled
    );
  }, [status]);

  const hasOutstandingRequirements =
    status?.requirements && status.requirements.length > 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Payout Account
          </CardTitle>
          <CardDescription>
            Connect your bank account to receive payouts
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.connected) {
    return (
      <>
        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              Set Up Your Payout Account
            </CardTitle>
            <CardDescription>
              Create a Stripe Connect account without leaving the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-medium">Why this matters</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Receive payouts automatically when submissions are approved</li>
                <li>Secure onboarding powered by Stripe</li>
                <li>Only a few fields required — finish in under 5 minutes</li>
              </ul>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => setDialogOpen(true)}
            >
              <Banknote className="mr-2 h-4 w-4" />
              Create payout account
            </Button>
          </CardContent>
        </Card>
        <StripeOnboardingDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onCompleted={handleOnboardingCompleted}
        />
      </>
    );
  }

  return (
    <>
      <Card className={isActive ? "border-emerald-500/30" : "border-orange-500/30"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Payout Account
            </CardTitle>
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={
                isActive ? "bg-emerald-600 text-white" : "bg-orange-100 text-orange-800"
              }
            >
              {isActive ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Active
                </span>
              ) : hasOutstandingRequirements ? (
                "Action required"
              ) : (
                "Pending verification"
              )}
            </Badge>
          </div>
          <CardDescription>
            Manage your Stripe Connect payout status and outstanding actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <StatusRow
              label="Details submitted"
              value={status.details_submitted ? "Complete" : "Missing"}
              positive={status.details_submitted}
            />
            <StatusRow
              label="Payouts enabled"
              value={status.payouts_enabled ? "Ready" : "Disabled"}
              positive={status.payouts_enabled}
            />
            <StatusRow
              label="Charges enabled"
              value={status.charges_enabled ? "Enabled" : "Disabled"}
              positive={status.charges_enabled}
            />
            <StatusRow
              label="Bank account"
              value={
                status.bank_last4
                  ? `•••• ${status.bank_last4}`
                  : "Not connected"
              }
              positive={Boolean(status.bank_last4)}
            />
          </div>

          {hasOutstandingRequirements && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Action required to activate payouts
              </div>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                {status.requirements.slice(0, 4).map((item) => (
                  <li key={item}>{item.replace(/_/g, " ")}</li>
                ))}
                {status.requirements.length > 4 && (
                  <li>+ {status.requirements.length - 4} more items</li>
                )}
              </ul>
              <Button
                variant="outline"
                className="mt-3 w-full border-orange-300 hover:bg-orange-100"
                onClick={() => setDialogOpen(true)}
              >
                Update payout details
              </Button>
            </div>
          )}

          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-1">
                  <Wallet2 className="h-4 w-4 text-muted-foreground" />
                  Stripe balance
                </p>
                <p className="text-xs text-muted-foreground">
                  Available balance updates as Stripe settles payouts.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <BalanceBlock
                title="Available"
                amount={balance?.available ?? 0}
                currency={balance?.currency ?? "USD"}
              />
              <BalanceBlock
                title="Pending"
                amount={balance?.pending ?? 0}
                currency={balance?.currency ?? "USD"}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <StripeOnboardingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCompleted={handleOnboardingCompleted}
      />
    </>
  );
}

function StatusRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-medium ${
          positive ? "text-emerald-600" : "text-orange-600"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function BalanceBlock({
  title,
  amount,
  currency,
}: {
  title: string;
  amount: number;
  currency: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="text-xl font-semibold">
        {new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
        }).format(amount)}
      </p>
    </div>
  );
}
