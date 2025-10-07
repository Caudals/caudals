"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  CreditCard, 
  DollarSign, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  Info,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { PaymentForm } from "./payment-form";

interface DatasetPaymentProps {
  datasetId: string;
  datasetTitle: string;
  currentBudget: number;
  samplesNeeded: number;
  rewardPerSample: number;
  paymentStatus: string;
  onPaymentSuccess?: () => void;
}

export function DatasetPayment({
  datasetId,
  datasetTitle,
  currentBudget,
  samplesNeeded,
  rewardPerSample,
  paymentStatus,
  onPaymentSuccess
}: DatasetPaymentProps) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const totalRequired = samplesNeeded * rewardPerSample;
  const remainingAmount = totalRequired - currentBudget;
  const isFullyFunded = currentBudget >= totalRequired;
  const isPartiallyFunded = currentBudget > 0 && currentBudget < totalRequired;

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getPaymentStatusBadge = () => {
    switch (paymentStatus) {
      case "paid":
        return <Badge className="bg-green-500">Fully Funded</Badge>;
      case "partial":
        return <Badge className="bg-yellow-500">Partially Funded</Badge>;
      case "unpaid":
        return <Badge variant="destructive">Unfunded</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentForm(false);
    onPaymentSuccess?.();
    toast.success("Payment successful! Your dataset is now funded.");
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Dataset Funding
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dataset Info */}
        <div className="space-y-2">
          <h4 className="font-semibold">{datasetTitle}</h4>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            {getPaymentStatusBadge()}
          </div>
        </div>

        <Separator />

        {/* Funding Breakdown */}
        <div className="space-y-4">
          <h4 className="font-semibold">Funding Breakdown</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Samples Needed:</span>
                <span className="font-medium">{samplesNeeded}</span>
              </div>
              <div className="flex justify-between">
                <span>Reward per Sample:</span>
                <span className="font-medium">{formatAmount(rewardPerSample)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Required:</span>
                <span className="font-medium">{formatAmount(totalRequired)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Current Budget:</span>
                <span className="font-medium">{formatAmount(currentBudget)}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining:</span>
                <span className={`font-medium ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatAmount(remainingAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Progress:</span>
                <span className="font-medium">
                  {Math.round((currentBudget / totalRequired) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Payment Actions */}
        {!isFullyFunded ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                {isPartiallyFunded 
                  ? `Additional ${formatAmount(remainingAmount)} needed to fully fund this dataset`
                  : `This dataset needs ${formatAmount(totalRequired)} to start collecting contributions`
                }
              </span>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowPaymentForm(true)}
                className="flex-1"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                {isPartiallyFunded ? "Add More Funds" : "Fund Dataset"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowPaymentForm(true)}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Custom Amount
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-800">
              This dataset is fully funded and ready to collect contributions!
            </span>
          </div>
        )}

        {/* Payment Form Modal */}
        {showPaymentForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Fund Dataset</h3>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowPaymentForm(false)}
                  >
                    ×
                  </Button>
                </div>
                <PaymentForm
                  datasetId={datasetId}
                  datasetTitle={datasetTitle}
                  currentBudget={currentBudget}
                  onPaymentSuccess={handlePaymentSuccess}
                />
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
          <Info className="h-4 w-4 text-blue-600 mt-0.5" />
          <div className="text-xs text-blue-800">
            <p className="font-medium">How funding works:</p>
            <ul className="mt-1 space-y-1">
              <li>• Funds are held securely until contributions are approved</li>
              <li>• Contributors receive payments automatically upon approval</li>
              <li>• 10% platform commission is deducted from each payment</li>
              <li>• Unused funds can be refunded if dataset is cancelled</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
