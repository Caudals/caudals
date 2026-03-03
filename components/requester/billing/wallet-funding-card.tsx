"use client";

import { useState, useTransition } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import { createWalletFundingCheckoutSession } from "@/lib/actions/payment-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

export function WalletFundingCard() {
  const [amount, setAmount] = useState("100");
  const [isPending, startTransition] = useTransition();
  const toast = useLocaleToast();
  const t = useTranslations();

  const handleTopUp = () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a valid amount greater than 0.");
      return;
    }

    startTransition(async () => {
      const result = await createWalletFundingCheckoutSession(parsed, "USD");
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const checkoutUrl = result.data?.checkout_url;
      if (!checkoutUrl) {
        toast.error("Unable to start checkout.");
        return;
      }

      window.location.assign(checkoutUrl);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Top up wallet")}</CardTitle>
        <CardDescription>
          {t("Add funds with Stripe Checkout and use your wallet for fast dataset funding.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("Amount in USD")}
          />
          <Button onClick={handleTopUp} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="mr-2 h-4 w-4" />
            )}
            {t("Continue to Stripe")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Sandbox mode: no real charges are created.")}
        </p>
      </CardContent>
    </Card>
  );
}
