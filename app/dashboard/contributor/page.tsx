import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ContributorStatsCards } from "@/components/dashboard/contributor-stats-cards";
import { RecentContributions } from "@/components/dashboard/recent-contributions";
import { WalletOverview } from "@/components/dashboard/wallet-overview";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, Send, Clock, CheckCircle, Database } from "lucide-react";
import { getUserWallet, getUserTransactions } from "@/lib/actions/payment-actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export default async function ContributorDashboardPage() {
  // Get wallet data
  const walletResult = await getUserWallet();
  const walletBalance = walletResult.data?.balance || 0;

  // Get recent transactions
  const transactionsResult = await getUserTransactions(5);
  const recentTransactions = transactionsResult.data || [];

  // Get submission stats
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let submissionStats = {
    total: 0,
    approved: 0,
    pending: 0,
    totalEarnings: 0,
  };

  if (user) {
    const { data: submissions } = await supabase
      .from("submissions")
      .select("status, dataset_requests(reward_amount)")
      .eq("contributor_id", user.id);

    if (submissions) {
      submissionStats = {
        total: submissions.length,
        approved: submissions.filter(s => s.status === "approved").length,
        pending: submissions.filter(s => s.status === "pending").length,
        totalEarnings: submissions
          .filter(s => s.status === "approved")
          .reduce((sum, s) => sum + (s.dataset_requests?.reward_amount || 0), 0),
      };
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Contributor Dashboard"
          description="Track your contributions and earnings"
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Main Stats */}
          <ContributorStatsCards />

          {/* Wallet and Earnings Section */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Wallet Balance */}
            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-emerald-600" />
                  Wallet Balance
                </CardTitle>
                <CardDescription>
                  Your available earnings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <p className="text-4xl font-bold text-emerald-600">
                    ${walletBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Ready for withdrawal
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button asChild size="sm">
                      <Link href="/dashboard/billing">
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Withdraw
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/billing">
                        View History
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Earnings Stats */}
            <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  Total Earnings
                </CardTitle>
                <CardDescription>
                  Lifetime approved rewards
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <p className="text-4xl font-bold text-blue-600">
                    ${submissionStats.totalEarnings.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    From {submissionStats.approved} approved submissions
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/contributions">
                        <CheckCircle className="mr-2 h-4 w-4" />
                        View All
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/browse">
                        <Database className="mr-2 h-4 w-4" />
                        Find More
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Submission Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle>Submission Pipeline</CardTitle>
              <CardDescription>
                Track your contributions across stages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg bg-blue-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <Send className="h-5 w-5 text-blue-600" />
                    <Badge variant="secondary">{submissionStats.total}</Badge>
                  </div>
                  <p className="text-sm font-medium">Total Submitted</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All contributions
                  </p>
                </div>

                <div className="p-4 border rounded-lg bg-yellow-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <Clock className="h-5 w-5 text-yellow-600" />
                    <Badge variant="outline" className="bg-yellow-500/10">{submissionStats.pending}</Badge>
                  </div>
                  <p className="text-sm font-medium">Under Review</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Awaiting approval
                  </p>
                </div>

                <div className="p-4 border rounded-lg bg-emerald-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                    <Badge className="bg-emerald-600">{submissionStats.approved}</Badge>
                  </div>
                  <p className="text-sm font-medium">Approved</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Earning rewards
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>
                Your latest earnings and withdrawals
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentTransactions.length > 0 ? (
                <div className="space-y-3">
                  {recentTransactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {transaction.type === "payout" || transaction.type === "deposit" ? (
                          <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <Wallet className="h-4 w-4 text-blue-600" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {transaction.type.replace("_", " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {transaction.description}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${
                          transaction.type === "payout" || transaction.type === "deposit"
                            ? "text-emerald-600"
                            : "text-muted-foreground"
                        }`}>
                          {transaction.type === "withdrawal" ? "-" : "+"}$
                          {transaction.amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No transactions yet</p>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link href="/browse">Start Contributing</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-4">
              <WalletOverview />
            </div>
            <div className="col-span-3">
              <RecentContributions />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
