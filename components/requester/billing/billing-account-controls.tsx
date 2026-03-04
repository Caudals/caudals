"use client";

import { useTransition } from "react";
import { Download, Loader2, WalletCards } from "lucide-react";
import { createRequesterBillingPortalSession } from "@/lib/actions/payment-actions";
import { exportRequesterBillingLedgerCsv } from "@/lib/actions/requester-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

export function BillingAccountControls() {
  const toast = useLocaleToast();
  const t = useTranslations();
  const [isPortalPending, startPortalTransition] = useTransition();
  const [isExportPending, startExportTransition] = useTransition();

  const handleManageBilling = () => {
    startPortalTransition(async () => {
      const result = await createRequesterBillingPortalSession("/requester/billing");
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      if (!result.data?.url) {
        toast.error("Billing portal URL was not returned.");
        return;
      }

      window.location.assign(result.data.url);
    });
  };

  const handleExportLedger = () => {
    startExportTransition(async () => {
      const result = await exportRequesterBillingLedgerCsv();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const csv = result.data?.content;
      if (!csv) {
        toast.error("Unable to export ledger CSV.");
        return;
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.data.filename ?? "requester-ledger.csv";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success("Ledger CSV downloaded.");
    });
  };

  return (
    <Card className="bg-white shadow-sm border border-border">
      <CardHeader>
        <CardTitle>{t("Billing tools")}</CardTitle>
        <CardDescription>
          {t("Manage Stripe payment methods and export your transaction ledger for finance workflows.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          onClick={handleManageBilling}
          disabled={isPortalPending || isExportPending}
        >
          {isPortalPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <WalletCards className="mr-2 h-4 w-4" />
          )}
          {t("Manage payment methods")}
        </Button>
        <Button
          variant="secondary"
          onClick={handleExportLedger}
          disabled={isPortalPending || isExportPending}
        >
          {isExportPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {t("Download ledger CSV")}
        </Button>
      </CardContent>
    </Card>
  );
}
