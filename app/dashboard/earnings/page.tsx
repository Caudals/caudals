import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StripeConnectStatus } from "@/components/dashboard/stripe-connect-status";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp, DollarSign, Clock, CheckCircle } from "lucide-react";
import { getUserTransactions } from "@/lib/actions/payment-actions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export default async function EarningsPage() {
  // Check user role and redirect if not contributor
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // Redirect requesters to billing page
    if (profile?.role === "requester") {
      redirect("/dashboard/billing");
    }
  }

  // Get transactions (payouts and commission)
  const transactionsResult = await getUserTransactions(50);
  const allTransactions = transactionsResult.data || [];

  const getPlatformFeeCents = (metadata: unknown): number => {
    if (metadata && typeof metadata === "object" && "platform_fee" in metadata) {
      const fee = (metadata as { platform_fee?: number }).platform_fee;
      return typeof fee === "number" ? fee : 0;
    }
    return 0;
  };

  // Filter payouts and calculate stats
  const payouts = allTransactions.filter((t) => t.type === "submission_payout");

  const totalEarnings = payouts.reduce((sum, t) => sum + t.amount, 0);
  const totalCommission = payouts.reduce(
    (sum, t) => sum + getPlatformFeeCents(t.metadata) / 100,
    0,
  );
  const grossEarnings = totalEarnings + totalCommission;

  const completedPayouts = payouts.filter((t) => t.status === "completed");

  return (
    <>
      <DashboardHeader
        title="Earnings & Payouts"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard/contributor" },
          { label: "Earnings" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Earnings Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Earnings (After Fee)</CardDescription>
              <CardTitle className="text-3xl text-emerald-600">
                ${totalEarnings.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                From {completedPayouts.length} approved submissions
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Platform Fee (10%)</CardDescription>
              <CardTitle className="text-3xl text-muted-foreground">
                ${totalCommission.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Total platform commission
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Gross Earnings</CardDescription>
              <CardTitle className="text-3xl">
                ${grossEarnings.toLocaleString(undefined, {
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

        {/* Stripe Connect Setup */}
        <StripeConnectStatus />

        {/* How Payouts Work */}
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
                <h4 className="font-medium">Automatic Payouts</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>
                      Payouts are sent automatically when your submission is
                      approved
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>You receive 90% of the reward amount</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>Funds transferred directly to your bank account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>Usually arrives in 2-3 business days</span>
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

        {/* Payout History */}
        <Card>
          <CardHeader>
            <CardTitle>Payout History</CardTitle>
            <CardDescription>
              Your recent payouts and transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payouts.length > 0 ? (
              <div className="space-y-3">
                {payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50 sm:flex-nowrap"
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          payout.status === "completed"
                            ? "bg-emerald-500/10"
                            : "bg-orange-500/10"
                        }`}
                      >
                        {payout.status === "completed" ? (
                          <CheckCircle className="h-5 w-5 text-emerald-600" />
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
                          payout.status === "completed" ? "default" : "secondary"
                        }
                        className={
                          payout.status === "completed"
                            ? "bg-emerald-600"
                            : "bg-orange-600"
                        }
                      >
                        {payout.status}
                      </Badge>
                    </div>
                  </div>
                ))}
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
    </>
  );
}
