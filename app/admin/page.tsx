import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminDashboardStats } from "@/lib/actions/admin-actions";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileText,
  Users,
  Database,
  AlertCircle,
  Send,
  BarChart3,
  TrendingUp,
  Wallet,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdminAnalytics } from "@/components/admin/admin-analytics";
import { PaymentAnalytics } from "@/components/admin/payment-analytics";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function AdminDashboard() {
  await requireAdmin();
  const [statsResult, t] = await Promise.all([
    getAdminDashboardStats(),
    getServerTranslator(),
  ]);

  if ("error" in statsResult) {
    return (
      <>
        <DashboardHeader
          title={t("Admin Dashboard")}
          description={t("Platform administration and monitoring")}
        />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <p className="text-lg font-semibold">
              {t("Error loading dashboard")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("Please try again later")}
            </p>
          </div>
        </div>
      </>
    );
  }

  const stats = statsResult.data;

  const statCards = [
    {
      title: t("Pending Reviews"),
      value: (stats.pendingRequests + stats.pendingSubmissions).toString(),
      description: t("Items requiring attention"),
      icon: AlertCircle,
      color: "text-orange-600",
      bgColor: "bg-orange-500/10",
      trend: t("+12% from last week"),
      trendUp: false,
    },
    {
      title: t("Active Users"),
      value: stats.totalUsers.toString(),
      description: t("Registered platform users"),
      icon: Users,
      color: "text-violet-600",
      bgColor: "bg-violet-500/10",
      trend: t("+23% this month"),
      trendUp: true,
    },
    {
      title: t("Active Datasets"),
      value: stats.approvedDatasets.toString(),
      description: t("Approved and collecting"),
      icon: Database,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
      trend: t("+8% this month"),
      trendUp: true,
    },
    {
      title: t("Total Contributions"),
      value: stats.totalSubmissions.toString(),
      description: t("All-time submissions"),
      icon: Send,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
      trend: t("+156 this week"),
      trendUp: true,
    },
  ];

  return (
    <>
      <DashboardHeader
        title={t("Admin Dashboard")}
        description={t("Platform administration and monitoring")}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Main Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card
              key={stat.title}
              className="border-muted transition-all duration-200 hover:shadow-md"
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
                <div className="mb-1 text-2xl font-bold">{stat.value}</div>
                <p className="mb-2 text-xs text-muted-foreground">
                  {stat.description}
                </p>
                <div className="flex items-center text-xs">
                  <TrendingUp
                    className={`mr-1 h-3 w-3 ${
                      stat.trendUp ? "text-emerald-600" : "text-orange-600"
                    }`}
                  />
                  <span
                    className={
                      stat.trendUp ? "text-emerald-600" : "text-orange-600"
                    }
                  >
                    {stat.trend}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending Reviews Section */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange-600" />
                {t("Pending Dataset Requests")}
              </CardTitle>
              <CardDescription>
                {t("{{count}} requests awaiting approval", {
                  count: stats.pendingRequests,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-orange-600">
                    {stats.pendingRequests}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Review required")}
                  </p>
                </div>
                <Button asChild>
                  <Link href="/admin/requests">{t("Review Now")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-blue-600" />
                {t("Pending Submissions")}
              </CardTitle>
              <CardDescription>
                {t("{{count}} contributions to review", {
                  count: stats.pendingSubmissions,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-blue-600">
                    {stats.pendingSubmissions}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Quality check needed")}
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href="/admin/submissions">{t("Review Now")}</Link>
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
              {t("Platform Financial Overview")}
            </CardTitle>
            <CardDescription>
              {t("Transaction and wallet metrics")}
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
              {t("Platform Analytics")}
            </CardTitle>
            <CardDescription>
              {t("User activity and dataset performance")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminAnalytics />
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Quick Actions")}</CardTitle>
            <CardDescription>
              {t("Common administrative tasks")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link href="/admin/requests">
                <FileText className="mr-2 h-4 w-4" />
                {t("Review Requests")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/submissions">
                <Database className="mr-2 h-4 w-4" />
                {t("Review Submissions")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/users">
                <Users className="mr-2 h-4 w-4" />
                {t("Manage Users")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/browse">
                <Activity className="mr-2 h-4 w-4" />
                {t("View Platform")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
