"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  DollarSign,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  createPaymentIntent,
  payWithWallet,
  getUserWallet,
} from "@/lib/actions/payment-actions";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useStripe as useStripeHook } from "@/lib/hooks/use-stripe";

interface PaymentFormProps {
  datasetId: string;
  datasetTitle: string;
  currentBudget?: number;
  onPaymentSuccess?: () => void;
}

interface PaymentFormInnerProps extends PaymentFormProps {
  externalAmount: string;
  onAmountChange: (amount: string) => void;
  clientSecret: string | null;
}

// Componente interno que usa Stripe Elements
function PaymentFormInner({
  datasetId,
  datasetTitle,
  currentBudget = 0,
  onPaymentSuccess,
  externalAmount,
  onAmountChange,
  clientSecret,
}: PaymentFormInnerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "upfront" | "per_contribution"
  >("upfront");
  const [paymentType, setPaymentType] = useState<"stripe" | "wallet">("stripe");
  const [walletBalance, setWalletBalance] = useState(0);

  const stripe = useStripe();
  const elements = useElements();

  const amount = externalAmount;
  const setAmount = onAmountChange;

  // Load wallet balance
  React.useEffect(() => {
    const loadWalletBalance = async () => {
      const result = await getUserWallet();
      if (result.data) {
        setWalletBalance(result.data.balance || 0);
      }
    };
    loadWalletBalance();
  }, []);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const paymentAmount = parseFloat(amount);
    setIsProcessing(true);

    try {
      if (paymentType === "wallet") {
        // Pay with wallet
        if (walletBalance < paymentAmount) {
          toast.error("Insufficient wallet balance");
          return;
        }

        const result = await payWithWallet(datasetId, paymentAmount);

        if (result.error) {
          toast.error(result.error);
          return;
        }

        toast.success("Payment successful! Paid with wallet balance.");
        onPaymentSuccess?.();
      } else {
        // Pay with Stripe
        if (!stripe || !elements) {
          toast.error(
            "Payment system is not ready. Please wait a moment and try again."
          );
          console.error("Stripe or Elements not available:", {
            stripe: !!stripe,
            elements: !!elements,
          });
          return;
        }

        // Confirm payment with Payment Element
        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/dashboard/requests?payment=success`,
          },
          redirect: "if_required",
        });

        if (error) {
          toast.error(error.message || "Payment failed");
        } else {
          toast.success("Payment successful!");
          onPaymentSuccess?.();
        }
      }
    } catch (error) {
      toast.error("An error occurred during payment");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const calculateCommission = (amount: number) => {
    const commissionRate = 0.1; // 10% platform commission
    return amount * commissionRate;
  };

  const totalAmount = parseFloat(amount) || 0;
  const commission = calculateCommission(totalAmount);
  const netAmount = totalAmount - commission;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Fund Dataset
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dataset Info */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Dataset</Label>
          <p className="text-sm text-muted-foreground">{datasetTitle}</p>
          {currentBudget > 0 && (
            <Badge variant="secondary" className="w-fit">
              Current Budget: {formatAmount(currentBudget)}
            </Badge>
          )}
        </div>

        <Separator />

        {/* Payment Method Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Payment Model</Label>
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                value="upfront"
                checked={paymentMethod === "upfront"}
                onChange={(e) => setPaymentMethod(e.target.value as "upfront")}
                className="rounded"
              />
              <span className="text-sm">Upfront Funding</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                value="per_contribution"
                checked={paymentMethod === "per_contribution"}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as "per_contribution")
                }
                className="rounded"
              />
              <span className="text-sm">Per-Contribution</span>
            </label>
          </div>
        </div>

        <Separator />

        {/* Amount Input */}
        <form onSubmit={handlePayment} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="1"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Payment Method</Label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  value="stripe"
                  checked={paymentType === "stripe"}
                  onChange={(e) => setPaymentType(e.target.value as "stripe")}
                  className="rounded"
                />
                <span className="text-sm">Credit/Debit Card</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  value="wallet"
                  checked={paymentType === "wallet"}
                  onChange={(e) => setPaymentType(e.target.value as "wallet")}
                  className="rounded"
                />
                <span className="text-sm">
                  Wallet Balance ({formatAmount(walletBalance)})
                </span>
              </label>
            </div>
            {paymentType === "wallet" &&
              walletBalance < parseFloat(amount || "0") && (
                <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="text-xs text-yellow-800">
                    Insufficient wallet balance. Add funds to continue.
                  </span>
                </div>
              )}
          </div>

          {/* Payment Details - Only show for Stripe payments */}
          {paymentType === "stripe" && (
            <div className="space-y-2">
              <Label>Payment Details</Label>
              {clientSecret ? (
                <div className="rounded-md">
                  <PaymentElement />
                </div>
              ) : (
                <div className="p-4 border rounded-md bg-muted/50 text-sm text-muted-foreground">
                  Enter an amount above to see payment options
                </div>
              )}
            </div>
          )}

          {/* Cost Breakdown */}
          {totalAmount > 0 && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Amount:</span>
                <span>{formatAmount(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Platform Commission (10%):</span>
                <span className="text-orange-600">
                  -{formatAmount(commission)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm font-medium">
                <span>Available for Contributors:</span>
                <span className="text-green-600">
                  {formatAmount(netAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Payment Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={
              isProcessing ||
              !amount ||
              parseFloat(amount) <= 0 ||
              (paymentType === "wallet" && walletBalance < parseFloat(amount)) ||
              (paymentType === "stripe" && !clientSecret)
            }
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <DollarSign className="mr-2 h-4 w-4" />
            )}
            {isProcessing
              ? "Processing..."
              : paymentType === "wallet"
              ? `Pay ${formatAmount(totalAmount)} with Wallet`
              : `Pay ${formatAmount(totalAmount)} with Card`}
          </Button>
        </form>

        {/* Info */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
          <Info className="h-4 w-4 text-blue-600 mt-0.5" />
          <div className="text-xs text-blue-800">
            <p className="font-medium">Payment Information:</p>
            <ul className="mt-1 space-y-1">
              <li>• Secure payment processed by Stripe</li>
              <li>• 10% platform commission deducted</li>
              <li>• Funds held until contributions are approved</li>
              <li>• Automatic payouts to contributors</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Componente wrapper con Stripe Elements
export function PaymentForm(props: PaymentFormProps) {
  const { stripe, loading, error } = useStripeHook();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>("");

  // Create payment intent when amount changes
  React.useEffect(() => {
    const createIntent = async () => {
      if (amount && parseFloat(amount) > 0) {
        const result = await createPaymentIntent(props.datasetId, parseFloat(amount));
        if (result.data?.client_secret) {
          setClientSecret(result.data.client_secret);
        }
      } else {
        setClientSecret(null);
      }
    };
    
    const timer = setTimeout(createIntent, 500); // Debounce
    return () => clearTimeout(timer);
  }, [amount, props.datasetId]);

  if (error) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Fund Dataset
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-4 bg-red-50 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Payment System Error
              </p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
              <p className="text-xs text-gray-600 mt-2">
                Please check your internet connection and try refreshing the
                page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading || !stripe) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Fund Dataset
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading payment system...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Always provide Elements context, but only include clientSecret when available
  const options = clientSecret ? {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
    },
  } : {
    mode: 'payment' as const,
    amount: 1000, // placeholder amount
    currency: 'usd',
    appearance: {
      theme: 'stripe' as const,
    },
  };

  return (
    <Elements stripe={stripe} options={options}>
      <PaymentFormInner 
        {...props} 
        externalAmount={amount}
        onAmountChange={setAmount}
        clientSecret={clientSecret}
      />
    </Elements>
  );
}
