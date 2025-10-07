import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentRequests } from "@/components/dashboard/recent-requests";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Plus } from "lucide-react";
import { getUserWallet } from "@/lib/actions/payment-actions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function RequesterDashboardPage() {
  // Check user role and redirect if contributor
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    // Redirect contributors to their dashboard
    if (profile?.role === 'contributor') {
      redirect('/dashboard/contributor');
    }
  }
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

          {/* Quick Actions */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Wallet & Billing
                </CardTitle>
                <CardDescription>
                  Manage your wallet, view transactions, and add funds
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">
                      ${walletBalance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Current Balance
                    </p>
                  </div>
                  <Button asChild>
                    <Link href="/dashboard/billing">
                      Manage Wallet
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create New Request
                </CardTitle>
                <CardDescription>
                  Start collecting data for a new dataset
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href="/dashboard/requests/new">
                    <Plus className="mr-2 h-4 w-4" />
                    New Dataset Request
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Activity and Recent Requests */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-4">
              <ActivityChart />
            </div>
            <div className="col-span-3">
              <RecentRequests />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
