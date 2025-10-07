"use client";

import { useState } from "react";
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
  CheckCircle,
  AlertCircle,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { createPaymentIntent } from "@/lib/actions/payment-actions";
import { loadStripe } from "@stripe/stripe-js";

interface PaymentFormProps {
  datasetId: string;
  datasetTitle: string;
  currentBudget?: number;
  onPaymentSuccess?: () => void;
}

export function PaymentForm({ 
  datasetId, 
  datasetTitle, 
  currentBudget = 0,
  onPaymentSuccess 
}: PaymentFormProps) {
  const [amount, setAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"upfront" | "per_contribution">("upfront");

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);

    try {
      // Create payment intent
      const result = await createPaymentIntent(datasetId, parseFloat(amount));
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      // Load Stripe
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
      
      if (!stripe) {
        toast.error("Stripe failed to load");
        return;
      }

      // Confirm payment
      const { error } = await stripe.confirmCardPayment(result.data!.client_secret!);
      
      if (error) {
        toast.error(error.message || "Payment failed");
      } else {
        toast.success("Payment successful!");
        onPaymentSuccess?.();
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
    const commissionRate = 0.10; // 10% platform commission
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
                onChange={(e) => setPaymentMethod(e.target.value as "per_contribution")}
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

          {/* Cost Breakdown */}
          {totalAmount > 0 && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Amount:</span>
                <span>{formatAmount(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Platform Commission (10%):</span>
                <span className="text-orange-600">-{formatAmount(commission)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm font-medium">
                <span>Available for Contributors:</span>
                <span className="text-green-600">{formatAmount(netAmount)}</span>
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
            {isProcessing ? "Processing..." : `Pay ${formatAmount(totalAmount)}`}
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
