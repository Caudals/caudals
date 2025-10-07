import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminDashboardStats } from "@/lib/actions/admin-actions";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Users,
  CheckCircle,
  Database,
  AlertCircle,
  Send,
  BarChart3,
  TrendingUp,
  DollarSign,
  Wallet,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdminAnalytics } from "@/components/admin/admin-analytics";
import { PaymentAnalytics } from "@/components/admin/payment-analytics";

export default async function AdminDashboard() {
  await requireAdmin();
  const statsResult = await getAdminDashboardStats();

  if ("error" in statsResult) {
    return (
      <SidebarProvider defaultOpen={true}>
        <AppSidebar collapsible="icon" />
        <SidebarInset>
          <DashboardHeader
            title="Admin Dashboard"
            description="Platform administration and monitoring"
          />
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p className="text-lg font-semibold">Error loading dashboard</p>
              <p className="text-sm text-muted-foreground">Please try again later</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const stats = statsResult.data;

  const statCards = [
    {
      title: "Pending Reviews",
      value: (stats.pendingRequests + stats.pendingSubmissions).toString(),
      description: "Items requiring attention",
      icon: AlertCircle,
      color: "text-orange-600",
      bgColor: "bg-orange-500/10",
      trend: "+12% from last week",
      trendUp: false,
    },
    {
      title: "Active Users",
      value: stats.totalUsers.toString(),
      description: "Registered platform users",
      icon: Users,
      color: "text-violet-600",
      bgColor: "bg-violet-500/10",
      trend: "+23% this month",
      trendUp: true,
    },
    {
      title: "Active Datasets",
      value: stats.approvedDatasets.toString(),
      description: "Approved and collecting",
      icon: Database,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
      trend: "+8% this month",
      trendUp: true,
    },
    {
      title: "Total Contributions",
      value: stats.totalSubmissions.toString(),
      description: "All-time submissions",
      icon: Send,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
      trend: "+156 this week",
      trendUp: true,
    },
  ];

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Admin Dashboard"
          description="Platform administration and monitoring"
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Main Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat) => (
              <Card
                key={stat.title}
                className="hover:shadow-md transition-all duration-200 border-muted"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold mb-1">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {stat.description}
                  </p>
                  <div className="flex items-center text-xs">
                    <TrendingUp
                      className={`h-3 w-3 mr-1 ${
                        stat.trendUp ? "text-emerald-600" : "text-orange-600"
                      }`}
                    />
                    <span className={stat.trendUp ? "text-emerald-600" : "text-orange-600"}>
                      {stat.trend}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pending Reviews Section */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-orange-600" />
                  Pending Dataset Requests
                </CardTitle>
                <CardDescription>
                  {stats.pendingRequests} request{stats.pendingRequests !== 1 ? "s" : ""} awaiting approval
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold text-orange-600">
                      {stats.pendingRequests}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Review required
                    </p>
                  </div>
                  <Button asChild>
                    <Link href="/admin/requests">
                      Review Now
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-blue-600" />
                  Pending Submissions
                </CardTitle>
                <CardDescription>
                  {stats.pendingSubmissions} contribution{stats.pendingSubmissions !== 1 ? "s" : ""} to review
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold text-blue-600">
                      {stats.pendingSubmissions}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Quality check needed
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link href="/admin/submissions">
                      Review Now
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Platform Financial Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Platform Financial Overview
              </CardTitle>
              <CardDescription>
                Transaction and wallet metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentAnalytics />
            </CardContent>
          </Card>

          {/* Analytics Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Platform Analytics
              </CardTitle>
              <CardDescription>
                User activity and dataset performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminAnalytics />
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common administrative tasks</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild size="sm">
                <Link href="/admin/requests">
                  <FileText className="mr-2 h-4 w-4" />
                  Review Requests
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/submissions">
                  <Database className="mr-2 h-4 w-4" />
                  Review Submissions
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/users">
                  <Users className="mr-2 h-4 w-4" />
                  Manage Users
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/browse">
                  <Activity className="mr-2 h-4 w-4" />
                  View Platform
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
