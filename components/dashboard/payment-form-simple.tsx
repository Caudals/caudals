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
import { createPaymentIntent } from "@/lib/actions/payment-actions";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

interface PaymentFormProps {
  datasetId: string;
  datasetTitle: string;
  currentBudget?: number;
  onPaymentSuccess?: () => void;
}

// Componente interno que usa Stripe Elements
function PaymentFormInner({
  datasetId,
  datasetTitle,
  currentBudget = 0,
  onPaymentSuccess,
}: PaymentFormProps) {
  const [amount, setAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "upfront" | "per_contribution"
  >("upfront");
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const stripe = useStripe();
  const elements = useElements();

  // Create payment intent when amount changes
  React.useEffect(() => {
    const createIntent = async () => {
      if (amount && parseFloat(amount) > 0) {
        const result = await createPaymentIntent(datasetId, parseFloat(amount));
        if (result.data?.client_secret) {
          setClientSecret(result.data.client_secret);
        }
      }
    };

    const timer = setTimeout(createIntent, 500); // Debounce
    return () => clearTimeout(timer);
  }, [amount, datasetId]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

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

    setIsProcessing(true);

    try {
      console.log("💳 Iniciando pago...", { datasetId, amount });

      // Confirm payment with Payment Element
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/dashboard/requests?payment=success`,
        },
        redirect: "if_required",
      });

      if (error) {
        console.error("❌ Error en el pago:", error);
        toast.error(error.message || "Payment failed");
      } else {
        console.log("✅ Pago exitoso!");
        toast.success("Payment successful!");
        onPaymentSuccess?.();
      }
    } catch (error) {
      console.error("❌ Error general:", error);
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

          {/* Payment Details */}
          {clientSecret && (
            <div className="space-y-2">
              <Label>Payment Details</Label>
              <div className="rounded-md">
                <PaymentElement />
              </div>
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
            disabled={isProcessing || !amount || parseFloat(amount) <= 0}
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <DollarSign className="mr-2 h-4 w-4" />
            )}
            {isProcessing
              ? "Processing..."
              : `Pay ${formatAmount(totalAmount)}`}
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

// Componente wrapper con Stripe Elements - versión simple
export function PaymentFormSimple(props: PaymentFormProps) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  console.log(
    "🔑 PaymentFormSimple: Publishable key:",
    publishableKey ? "Configurada" : "No configurada"
  );

  if (!publishableKey) {
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
                Configuration Error
              </p>
              <p className="text-xs text-red-600 mt-1">
                Stripe publishable key is not configured
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements stripe={stripePromise}>
      <PaymentFormInner {...props} />
    </Elements>
  );
}
