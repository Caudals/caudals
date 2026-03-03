"use client";

import { useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportContributorPayoutLedgerCsv } from "@/lib/actions/payment-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

export function EarningsAccountTools() {
  const toast = useLocaleToast();
  const t = useTranslations();
  const [isExportPending, startExportTransition] = useTransition();

  const handleExportPayouts = () => {
    startExportTransition(async () => {
      const result = await exportContributorPayoutLedgerCsv();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const csv = result.data?.content;
      if (!csv) {
        toast.error("Unable to export payout CSV.");
        return;
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.data?.filename ?? "contributor-payouts.csv";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success("Payout CSV downloaded.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Payout tools")}</CardTitle>
        <CardDescription>
          {t("Download your payout ledger for accounting and compliance workflows.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="secondary"
          onClick={handleExportPayouts}
          disabled={isExportPending}
        >
          {isExportPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {t("Download payout CSV")}
        </Button>
      </CardContent>
    </Card>
  );
}
