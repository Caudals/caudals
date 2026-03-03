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
    <div className="space-y-6">
      <ContributorPageHeader
        eyebrow="Earnings operations"
        title="Earnings and payouts"
        description="Monitor payout status, Stripe readiness, and settlement timelines in one place."
        actions={
          <>
            <Button asChild variant="outline">
              <Link
                href="/contributor/contributions"
                data-dashboard-action="contributor_earnings_open_contributions"
              >
                View contributions
              </Link>
            </Button>
            <Button asChild>
              <Link
                href="/contributor/settings"
                data-dashboard-action="contributor_earnings_open_settings"
              >
                Payout settings
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Earnings (After Fee)</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">
              $
              {totalEarnings.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              From {completedPayouts.length} settled payout
              {completedPayouts.length === 1 ? "" : "s"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending Payouts</CardDescription>
            <CardTitle className="text-3xl text-amber-600">
              {pendingPayouts.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Transfer created but not yet settled
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Failed Payouts</CardDescription>
            <CardTitle className="text-3xl text-destructive">
              {failedPayouts.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Needs admin reconciliation
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Gross Earnings</CardDescription>
            <CardTitle className="text-3xl">
              $
              {grossEarnings.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Before platform fee
            </div>
          </CardContent>
        </Card>
      </div>

      <StripeConnectStatus />
      <EarningsAccountTools />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            How Payouts Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="font-medium">Payout timeline</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>
                    Approved: your submission is approved by review team.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 text-amber-600" />
                  <span>
                    Transfer created: payout transaction enters pending queue.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>Settled: funds land in your payout account.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                  <span>Failed: admin reconciliation is required.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium">Platform Fee Breakdown</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between rounded bg-muted p-2">
                  <span>Example: $100 reward</span>
                  <span className="font-medium">$100.00</span>
                </div>
                <div className="flex justify-between rounded bg-orange-50 p-2">
                  <span>Platform fee (10%)</span>
                  <span className="font-medium text-orange-600">-$10.00</span>
                </div>
                <div className="flex justify-between rounded border border-emerald-200 bg-emerald-50 p-2">
                  <span>You receive (90%)</span>
                  <span className="font-medium text-emerald-600">$90.00</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout History</CardTitle>
          <CardDescription>
            Your recent payouts and transaction status timeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payouts.length > 0 ? (
            <div className="space-y-3">
              {payouts.map((payout) => {
                const transferCreated =
                  Boolean(payout.reference_id) || payout.status !== "cancelled";
                const settled = payout.status === "completed";
                const failed = payout.status === "failed";
                const failureReason = getPayoutFailureReason(payout.metadata);

                return (
                  <div
                    key={payout.id}
                    className="space-y-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-1 items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            payout.status === "completed"
                              ? "bg-emerald-500/10"
                              : payout.status === "failed"
                                ? "bg-red-500/10"
                                : "bg-orange-500/10"
                          }`}
                        >
                          {payout.status === "completed" ? (
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                          ) : payout.status === "failed" ? (
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                          ) : (
                            <Clock className="h-5 w-5 text-orange-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {payout.description || "Payout"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(payout.created_at).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="font-semibold text-emerald-600">
                          +$
                          {payout.amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <Badge
                          variant={
                            payout.status === "completed"
                              ? "default"
                              : "secondary"
                          }
                          className={
                            payout.status === "completed"
                              ? "bg-emerald-600"
                              : payout.status === "failed"
                                ? "bg-destructive"
                                : "bg-orange-600"
                          }
                        >
                          {payout.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-3">
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
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                        <p className="font-medium text-destructive">
                          Payout requires remediation
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {failureReason ??
                            "The transfer failed. Update payout account details and contact support if the issue persists."}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href="/contributor/settings">
                              Update payout settings
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link href="/contributor">Open contributor dashboard</Link>
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <DollarSign className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 text-muted-foreground">No payouts yet</p>
              <p className="text-sm text-muted-foreground">
                Your payouts will appear here when submissions are approved
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
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border/70 bg-muted/30 text-muted-foreground";

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs font-medium ${classes}`}
    >
      {label}
    </div>
  );
}
