import { ContributorPageHeader } from "@/components/contributor/shared/contributor-page-header";
import { StripeConnectStatus } from "@/components/contributor/earnings/stripe-connect-status";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { getUserTransactions } from "@/lib/actions/payment-actions";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EarningsAccountTools } from "@/components/contributor/earnings/earnings-account-tools";

export default async function EarningsPage() {
  const transactionsResult = await getUserTransactions(75);
  const allTransactions = transactionsResult.data || [];

  const getPlatformFeeCents = (metadata: unknown): number => {
    if (
      metadata &&
      typeof metadata === "object" &&
      "platform_fee" in metadata
    ) {
      const fee = (metadata as { platform_fee?: number }).platform_fee;
      return typeof fee === "number" ? fee : 0;
    }
    return 0;
  };
  const getPayoutFailureReason = (metadata: unknown): string | null => {
    if (!metadata || typeof metadata !== "object") return null;

    const record = metadata as Record<string, unknown>;
    const reason = record.failure_reason ?? record.error_message ?? record.transfer_status;
    return typeof reason === "string" && reason.trim().length > 0
      ? reason.trim()
      : null;
  };

  const payouts = allTransactions.filter((t) => t.type === "submission_payout");
  const completedPayouts = payouts.filter((t) => t.status === "completed");
  const pendingPayouts = payouts.filter((t) => t.status === "pending");
  const failedPayouts = payouts.filter((t) => t.status === "failed");

  const totalEarnings = payouts.reduce((sum, t) => sum + t.amount, 0);
  const totalCommission = payouts.reduce(
    (sum, t) => sum + getPlatformFeeCents(t.metadata) / 100,
    0,
  );
  const grossEarnings = totalEarnings + totalCommission;

  return (
    <div className="space-y-6 pb-10">
      <ContributorPageHeader
        title="Earnings & Payouts"
        description="Monitor payout status, Stripe readiness, and settlement timelines in one centralized hub."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" className="shadow-none rounded-lg">
              <Link
                href="/contributor/contributions"
                data-dashboard-action="contributor_earnings_open_contributions"
              >
                Contributions
              </Link>
            </Button>
            <Button asChild className="shadow-none rounded-lg">
              <Link
                href="/contributor/settings"
                data-dashboard-action="contributor_earnings_open_settings"
              >
                Settings
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />
      
      <div className="flex flex-col md:flex-row items-center justify-between border border-slate-200 bg-white rounded-2xl p-6 divide-y md:divide-y-0 md:divide-x divide-slate-200 mb-6">
        <div className="flex-1 w-full pr-6 pb-4 md:pb-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Net Earnings</span>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold text-emerald-700 tracking-tight">
              ${totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">From {completedPayouts.length} settled payout{completedPayouts.length === 1 ? "" : "s"}</p>
        </div>
        
        <div className="flex-1 w-full md:px-6 py-4 md:py-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Pending Payouts</span>
          <span className="text-2xl font-bold text-amber-600 tracking-tight">{pendingPayouts.length}</span>
          <p className="text-xs text-slate-400 mt-1">In queue, awaiting settlement</p>
        </div>

        <div className="flex-1 w-full md:px-6 py-4 md:py-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Failed Payouts</span>
          <span className="text-2xl font-bold text-red-600 tracking-tight">{failedPayouts.length}</span>
          <p className="text-xs text-slate-400 mt-1">Needs admin reconciliation</p>
        </div>
        
        <div className="flex-1 w-full md:pl-6 pt-4 md:pt-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Gross Earnings</span>
          <span className="text-2xl font-bold text-slate-900 tracking-tight">
            ${grossEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <p className="text-xs text-slate-400 mt-1">Before platform fee</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <StripeConnectStatus />
          <EarningsAccountTools />
        </div>

        <Card className="shadow-none border-slate-200 bg-white rounded-2xl">
          <CardHeader className="pb-4 border-b border-slate-200">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-slate-400" />
              How Payouts Work
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-5">
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-slate-900">Payout timeline</h4>
              <ul className="space-y-3 text-sm text-slate-500">
                <li className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div>
                    <span className="font-medium text-slate-900 block">Approved</span>
                    <span className="text-xs">Your submission is approved by the review team.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3 border-l-2 border-dashed border-slate-200 ml-3 pl-5 py-1">
                  <div className="h-6 w-6 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 mt-0.5 absolute -ml-8">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div>
                    <span className="font-medium text-slate-900 block">Transfer created</span>
                    <span className="text-xs">Payout transaction enters the pending queue.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div>
                    <span className="font-medium text-slate-900 block">Settled</span>
                    <span className="text-xs">Funds successfully land in your payout account.</span>
                  </div>
                </li>
              </ul>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h4 className="font-medium text-sm text-slate-900">Platform Fee Breakdown</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <span className="text-slate-500">Example: $100 reward</span>
                  <span className="font-medium text-slate-900">$100.00</span>
                </div>
                <div className="flex justify-between rounded-lg border border-orange-200/50 bg-orange-50/50 p-3">
                  <span className="text-orange-700/80">Platform fee (10%)</span>
                  <span className="font-medium text-orange-600">-$10.00</span>
                </div>
                <div className="flex justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <span className="text-emerald-700/80 font-medium">You receive (90%)</span>
                  <span className="font-bold text-emerald-600">$90.00</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none border-slate-200 bg-white rounded-2xl overflow-hidden py-0 gap-0">
        <CardHeader className="bg-slate-50 border-b border-slate-200 pb-4">
          <CardTitle className="text-base">Payout History</CardTitle>
          <CardDescription>
            Your recent payouts and transaction status timeline
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {payouts.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {payouts.map((payout) => {
                const transferCreated =
                  Boolean(payout.reference_id) || payout.status !== "cancelled";
                const settled = payout.status === "completed";
                const failed = payout.status === "failed";
                const failureReason = getPayoutFailureReason(payout.metadata);

                return (
                  <div
                    key={payout.id}
                    className="p-5 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-1 items-center gap-4">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                            payout.status === "completed"
                              ? "bg-emerald-50 border border-emerald-100"
                              : payout.status === "failed"
                                ? "bg-red-50 border border-red-100"
                                : "bg-amber-50 border border-amber-100"
                          }`}
                        >
                          {payout.status === "completed" ? (
                            <DollarSign className="h-6 w-6 text-emerald-600" />
                          ) : payout.status === "failed" ? (
                            <AlertTriangle className="h-6 w-6 text-destructive" />
                          ) : (
                            <Clock className="h-6 w-6 text-amber-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {payout.description || "Dataset Reward Payout"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge
                              variant="secondary"
                              className={`shadow-none text-[10px] uppercase tracking-wider px-2 py-0 h-5 ${
                                payout.status === "completed"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : payout.status === "failed"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {payout.status}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              {new Date(payout.created_at).toLocaleDateString(
                                "en-US",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900">
                          +$
                          {payout.amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono">
                          {payout.currency.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <TimelinePill label="Approved" state="done" />
                      <TimelinePill
                        label="Transfer created"
                        state={transferCreated ? "done" : "waiting"}
                      />
                      <TimelinePill
                        label="Settled"
                        state={failed ? "failed" : settled ? "done" : "waiting"}
                      />
                    </div>

                    {failed ? (
                      <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-destructive">
                            Action required: Payout failure
                          </p>
                          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                            {failureReason ??
                              "The transfer failed to process. Please verify your payout account details in settings. If the issue persists, contact support."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button asChild size="sm" variant="outline" className="h-8 text-xs shadow-none border-destructive/20 hover:bg-destructive/10">
                              <Link href="/contributor/settings">
                                Update settings
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center">
              <DollarSign className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="font-medium text-slate-900">No payouts yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Your payouts will appear here once submissions are approved and processed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TimelinePill({
  label,
  state,
}: {
  label: string;
  state: "done" | "waiting" | "failed";
}) {
  const classes =
    state === "done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : state === "failed"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-500";

  const Icon = state === "done" ? CheckCircle : state === "failed" ? AlertTriangle : Clock;

  return (
    <div
      className={`rounded-lg border px-3 py-2 flex items-center justify-center gap-2 transition-colors ${classes}`}
    >
      <Icon className="h-3 w-3" />
      <span className="text-[11px] font-semibold tracking-wide uppercase">{label}</span>
    </div>
  );
}