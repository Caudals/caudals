import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentRequests } from "@/components/dashboard/recent-requests";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { BillingOverview } from "@/components/dashboard/billing-overview";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, AlertCircle } from "lucide-react";
import { getUserWallet } from "@/lib/actions/payment-actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function RequesterDashboardPage() {
  // Get wallet data for display
  const walletResult = await getUserWallet();
  const walletBalance = walletResult.data?.balance || 0;

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Requester Dashboard"
          description="Manage your dataset requests and track collection progress"
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Main Stats */}
          <StatsCards />

          {/* Wallet Quick View */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Wallet Balance
              </CardTitle>
              <CardDescription>
                Available funds for dataset requests and rewards
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">
                    ${walletBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    USD
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/billing">
                      <TrendingUp className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href="/dashboard/billing">
                      Add Funds
                    </Link>
                  </Button>
                </div>
              </div>
              {walletBalance < 10 && (
                <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-600">Low Balance</p>
                    <p className="text-muted-foreground">
                      Consider adding funds to continue funding dataset requests
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity and Recent Requests */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-4">
              <ActivityChart />
            </div>
            <div className="col-span-3">
              <RecentRequests />
            </div>
          </div>

          {/* Billing Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Overview</CardTitle>
              <CardDescription>
                Your spending and transaction history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BillingOverview />
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
