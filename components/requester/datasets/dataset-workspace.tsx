"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmissionsPanel, SubmissionItem } from "@/components/requester/datasets/submissions-panel";
import { ExportPanel, ExportRecord } from "@/components/requester/datasets/export-panel";
import { AutomationPanel } from "@/components/requester/datasets/automation-panel";
import {
  createDatasetFundingCheckoutSession,
  getUserWallet,
  payWithWallet,
} from "@/lib/actions/payment-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

type RequesterDatasetDetail = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  status?: string;
  approval_status?: string;
  reward_amount?: number;
  data_type?: string;
  currency?: string | null;
  deadline?: string | null;
  image_url?: string | null;
  quality_criteria?: string[];
  requirements?: string[];
  samples_collected?: number;
  samples_needed?: number;
  total_budget?: number | null;
  paid_amount?: number | null;
  pendingSubmissions?: number;
  exports?: ExportRecord[];
  automation_config?: Record<string, unknown> | null;
};

export function DatasetWorkspace({
  detail,
  submissions,
}: {
  detail: RequesterDatasetDetail;
  submissions: SubmissionItem[];
}) {
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();
  const [isFundingPending, startFundingTransition] = useTransition();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [fundingAmount, setFundingAmount] = useState<string>("");

  const samplesCollected = Number(detail.samples_collected ?? 0);
  const samplesNeeded = Number(detail.samples_needed ?? 0);
  const progress =
    samplesNeeded > 0
      ? Math.min(100, Math.round((samplesCollected / samplesNeeded) * 100))
      : 0;
  const totalBudget = Number(detail.total_budget ?? 0);
  const fundedAmount = Number(detail.paid_amount ?? 0);
  const remainingToFund = Math.max(0, totalBudget - fundedAmount);

  const resolvedFundingAmount = useMemo(() => {
    if (fundingAmount.trim().length === 0) {
      return remainingToFund > 0 ? remainingToFund : 0;
    }

    const parsed = Number(fundingAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
  }, [fundingAmount, remainingToFund]);

  const currencyCode = (detail.currency ?? "USD").toUpperCase();
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(value);

  useEffect(() => {
    const loadWallet = async () => {
      const walletResult = await getUserWallet();
      if ("error" in walletResult || !walletResult.data) {
        setWalletBalance(null);
        return;
      }
      setWalletBalance(Number(walletResult.data.available_balance ?? 0));
    };

    void loadWallet();
  }, []);

  const onFundWithWallet = () => {
    if (remainingToFund <= 0) {
      toast.error("This dataset is already fully funded.");
      return;
    }

    if (resolvedFundingAmount <= 0) {
      toast.error("Enter a valid amount greater than 0.");
      return;
    }

    if (resolvedFundingAmount > remainingToFund) {
      toast.error(`Maximum remaining amount is ${formatMoney(remainingToFund)}.`);
      return;
    }

    startFundingTransition(async () => {
      const result = await payWithWallet(detail.id, resolvedFundingAmount);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Wallet funding applied.");
      router.refresh();
      const walletResult = await getUserWallet();
      if (!("error" in walletResult) && walletResult.data) {
        setWalletBalance(Number(walletResult.data.available_balance ?? 0));
      }
    });
  };

  const onFundWithCard = () => {
    if (remainingToFund <= 0) {
      toast.error("This dataset is already fully funded.");
      return;
    }

    if (resolvedFundingAmount <= 0) {
      toast.error("Enter a valid amount greater than 0.");
      return;
    }

    if (resolvedFundingAmount > remainingToFund) {
      toast.error(`Maximum remaining amount is ${formatMoney(remainingToFund)}.`);
      return;
    }

    startFundingTransition(async () => {
      const result = await createDatasetFundingCheckoutSession(
        detail.id,
        resolvedFundingAmount,
        currencyCode
      );

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const checkoutUrl = result.data?.checkout_url;
      if (!checkoutUrl) {
        toast.error("Stripe checkout URL was not returned.");
        return;
      }

      window.location.assign(checkoutUrl);
    });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white shadow-sm border border-border">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{detail.title}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize">
                  {detail.status ?? "draft"}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {detail.approval_status ?? "pending"}
                </Badge>
                <Badge variant="outline">{detail.data_type ?? "mixed"}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/requester/datasets/new?duplicate=${detail.id}`}>
                  {t("Duplicate")}
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/requester/datasets/${detail.id}/edit`}>
                  {t("Edit brief")}
                </Link>
              </Button>
            </div>
          </div>

          <p className="text-sm text-slate-500">
            {detail.description || t("No description provided yet.")}
          </p>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs uppercase text-slate-500">{t("Samples")}</p>
              <p className="text-lg font-semibold">
                {samplesCollected} / {samplesNeeded}
              </p>
              <Progress className="mt-2" value={progress} />
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs uppercase text-slate-500">{t("Reward")}</p>
              <p className="text-lg font-semibold">
                {detail.currency ?? "USD"} {Number(detail.reward_amount ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs uppercase text-slate-500">{t("Budget")}</p>
              <p className="text-lg font-semibold">
                {(detail.currency ?? "USD")} {Number(detail.paid_amount ?? 0).toLocaleString()} /{" "}
                {Number(detail.total_budget ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs uppercase text-slate-500">{t("Deadline")}</p>
              <p className="text-lg font-semibold">
                {detail.deadline
                  ? new Date(detail.deadline).toLocaleDateString()
                  : t("No deadline")}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("Funding actions")}</p>
                <p className="text-xs text-slate-500">
                  {t("Remaining budget:")} {formatMoney(remainingToFund)}
                </p>
                <p className="text-xs text-slate-500">
                  {t("Wallet available:")}{" "}
                  {walletBalance === null ? "—" : formatMoney(walletBalance)}
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href="/requester/billing">{t("Top up wallet")}</Link>
              </Button>
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder={remainingToFund > 0 ? remainingToFund.toFixed(2) : "0.00"}
                value={fundingAmount}
                onChange={(event) => setFundingAmount(event.target.value)}
              />
              <Button
                variant="secondary"
                disabled={isFundingPending || remainingToFund <= 0}
                onClick={onFundWithWallet}
              >
                {t("Fund from wallet")}
              </Button>
              <Button
                disabled={isFundingPending || remainingToFund <= 0}
                onClick={onFundWithCard}
              >
                {t("Fund with card")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="submissions" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">{t("Overview")}</TabsTrigger>
          <TabsTrigger value="submissions">
            {t("Submissions")} ({submissions.length})
          </TabsTrigger>
          <TabsTrigger value="exports">
            {t("Exports")} ({detail.exports?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="automation">{t("Automation")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="bg-white shadow-sm border border-border">
            <CardHeader>
              <CardTitle className="text-base">{t("Brief requirements")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("Quality criteria")}</p>
                {detail.quality_criteria && detail.quality_criteria.length > 0 ? (
                  <ul className="space-y-1 text-sm text-slate-500">
                    {detail.quality_criteria.map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">{t("No criteria listed.")}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("Contributor requirements")}</p>
                {detail.requirements && detail.requirements.length > 0 ? (
                  <ul className="space-y-1 text-sm text-slate-500">
                    {detail.requirements.map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">{t("No requirements listed.")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions">
          <Card className="bg-white shadow-sm border border-border">
            <CardHeader>
              <CardTitle className="text-base">{t("Submission review queue")}</CardTitle>
            </CardHeader>
            <CardContent>
              <SubmissionsPanel submissions={submissions} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exports">
          <Card className="bg-white shadow-sm border border-border">
            <CardHeader>
              <CardTitle className="text-base">{t("Export jobs")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ExportPanel datasetId={detail.id} exports={detail.exports ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation">
          <Card className="bg-white shadow-sm border border-border">
            <CardHeader>
              <CardTitle className="text-base">{t("Automation rules")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AutomationPanel
                datasetId={detail.id}
                config={detail.automation_config ?? {}}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
