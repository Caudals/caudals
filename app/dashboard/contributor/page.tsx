import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ContributorStatsCards } from "@/components/dashboard/contributor-stats-cards";
import { RecentContributions } from "@/components/dashboard/recent-contributions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Send, Clock, CheckCircle, Database, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function ContributorDashboardPage() {
  // Check user role and redirect if requester
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    // Redirect requesters to their dashboard
    if (profile?.role === 'requester') {
      redirect('/dashboard');
    }
  }

  // Get submission stats using the already created supabase client
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
          .reduce((sum, s) => {
            const rel = Array.isArray(s.dataset_requests)
              ? s.dataset_requests[0]
              : s.dataset_requests;
            return sum + (rel?.reward_amount || 0);
          }, 0),
      };
    }
  }

  const t = await getServerTranslator();

  return (
    <>
      <DashboardHeader
        title={t("Contributor Dashboard")}
        description={t("Track your contributions and earnings")}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Main Stats */}
        <ContributorStatsCards />

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Earnings Overview */}
          <Card className="border-emerald-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                {t("Earnings Overview")}
              </CardTitle>
              <CardDescription>
                {t("Track your earnings and payouts")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("Total Earned")}
                  </span>
                  <span className="text-lg font-semibold">
                    ${submissionStats.totalEarnings.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("Approved")}
                  </span>
                  <span className="text-sm font-medium">
                    {submissionStats.approved} {t("submissions")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("Pending")}
                  </span>
                  <span className="text-sm font-medium">
                    {submissionStats.pending} {t("submissions")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Browse Datasets */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                {t("Find Opportunities")}
              </CardTitle>
              <CardDescription>
                {t("Browse available datasets and contribute")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/browse">
                  <Database className="mr-2 h-4 w-4" />
                  {t("Browse Datasets")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/contributions">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {t("My Contributions")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Submission Pipeline */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Submission Pipeline")}</CardTitle>
            <CardDescription>
              {t("Track your contributions across stages")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg bg-blue-500/5">
                <div className="flex items-center justify-between mb-2">
                  <Send className="h-5 w-5 text-blue-600" />
                  <Badge variant="secondary">{submissionStats.total}</Badge>
                </div>
                <p className="text-sm font-medium">
                  {t("Total Submitted")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("All contributions")}
                </p>
              </div>

              <div className="p-4 border rounded-lg bg-yellow-500/5">
                <div className="flex items-center justify-between mb-2">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <Badge variant="outline" className="bg-yellow-500/10">{submissionStats.pending}</Badge>
                </div>
                <p className="text-sm font-medium">{t("Under Review")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("Awaiting approval")}
                </p>
              </div>

              <div className="p-4 border rounded-lg bg-emerald-500/5">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <Badge className="bg-emerald-600">{submissionStats.approved}</Badge>
                </div>
                <p className="text-sm font-medium">{t("Approved")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("Earning rewards")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Contributions */}
        <RecentContributions />
      </div>
    </>
  );
}
