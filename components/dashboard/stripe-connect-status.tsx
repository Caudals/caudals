"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  Shield,
  Landmark,
  RefreshCw
} from "lucide-react";
import { getStripeConnectStatus, createStripeConnectAccount } from "@/lib/actions/payment-actions";
import { toast } from "sonner";

interface ConnectStatus {
  connected: boolean;
  account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: string[];
  disabled_reason?: string | null;
}

export function StripeConnectStatus() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    const result = await getStripeConnectStatus();
    
    if (result.error) {
      toast.error(result.error);
    } else if (result.data) {
      setStatus(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSetupAccount = async () => {
    setCreating(true);
    const result = await createStripeConnectAccount();
    
    if (result.error) {
      toast.error(result.error);
      setCreating(false);
    } else if (result.data?.onboarding_url) {
      // Redirect to Stripe onboarding
      window.location.href = result.data.onboarding_url;
    } else {
      // Account already exists, refresh status
      toast.success("Account found! Refreshing status...");
      await loadStatus();
      setCreating(false);
    }
  };

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
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status?.connected) {
    return (
      <Card className="border-blue-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Payout Account Setup Required
          </CardTitle>
          <CardDescription>
            Set up your bank account to receive automatic payouts when your submissions are approved
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Why set up payouts?</h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Receive 90% of each submission reward directly to your bank</li>
              <li>Automatic transfers when your work is approved</li>
              <li>Secure payment processing via Stripe</li>
              <li>Takes ~5 minutes to complete</li>
            </ul>
          </div>

          <Button 
            onClick={handleSetupAccount}
            disabled={creating}
            className="w-full"
            size="lg"
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Landmark className="mr-2 h-4 w-4" />
                Set Up Payout Account
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            You&apos;ll be redirected to Stripe to securely connect your bank account
          </p>
        </CardContent>
      </Card>
    );
  }

  const isFullyActive = status.charges_enabled && status.payouts_enabled && status.details_submitted;
  const needsAction = !isFullyActive && status.requirements.length > 0;

  return (
    <Card className={isFullyActive ? "border-emerald-500/20" : "border-orange-500/20"}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Payout Account
          </CardTitle>
          <Badge variant={isFullyActive ? "default" : "secondary"} className={isFullyActive ? "bg-emerald-600" : "bg-orange-600"}>
            {isFullyActive ? (
              <>
                <CheckCircle className="mr-1 h-3 w-3" />
                Active
              </>
            ) : (
              <>
                <AlertCircle className="mr-1 h-3 w-3" />
                {needsAction ? "Action Required" : "Pending"}
              </>
            )}
          </Badge>
        </div>
        <CardDescription>
          Your Stripe Connect account for receiving payouts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Grid */}
        <div className="grid gap-3">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <span className="text-sm font-medium">Payouts Enabled</span>
            {status.payouts_enabled ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle className="mr-1 h-3 w-3" />
                Yes
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                <AlertCircle className="mr-1 h-3 w-3" />
                No
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <span className="text-sm font-medium">Details Submitted</span>
            {status.details_submitted ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle className="mr-1 h-3 w-3" />
                Yes
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                <AlertCircle className="mr-1 h-3 w-3" />
                No
              </Badge>
            )}
          </div>
        </div>

        {/* Requirements */}
        {needsAction && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h4 className="font-medium text-orange-900 mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Action Required
            </h4>
            <p className="text-sm text-orange-800 mb-3">
              Complete your account setup to enable payouts:
            </p>
            <ul className="text-sm text-orange-800 space-y-1 list-disc list-inside mb-4">
              {status.requirements.slice(0, 3).map((req) => (
                <li key={req}>{req.replace(/_/g, " ")}</li>
              ))}
              {status.requirements.length > 3 && (
                <li>And {status.requirements.length - 3} more...</li>
              )}
            </ul>
            <Button 
              onClick={handleSetupAccount}
              disabled={creating}
              variant="outline"
              className="w-full border-orange-300 hover:bg-orange-100"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Complete Setup on Stripe
                </>
              )}
            </Button>
          </div>
        )}

        {/* Disabled Reason */}
        {status.disabled_reason && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <h4 className="font-medium text-red-900 mb-2">Account Issue</h4>
            <p className="text-sm text-red-800">
              {status.disabled_reason}
            </p>
          </div>
        )}

        {/* Success Message */}
        {isFullyActive && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <h4 className="font-medium text-emerald-900 mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Ready for Payouts!
            </h4>
            <p className="text-sm text-emerald-800">
              Your account is fully set up. You&apos;ll receive automatic payouts when your submissions are approved.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            onClick={loadStatus}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Status
          </Button>
          {status.account_id && (
            <Button 
              onClick={() => window.open(`https://dashboard.stripe.com/${status.account_id}`, "_blank")}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Stripe
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Account ID: {status.account_id?.slice(0, 20)}...
        </p>
      </CardContent>
    </Card>
  );
}

