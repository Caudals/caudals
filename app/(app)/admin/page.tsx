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
        title={t("Good afternoon, {{name}}", { name: "Admin" })}
        description={t("Welcome back to your admin dashboard")}
      />
      <div className="flex flex-1 flex-col gap-8 p-6">
        {/* Top Section: Preview Card & Info */}
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="overflow-hidden border-muted bg-muted/20 shadow-sm">
              <div className="aspect-video w-full bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-background shadow-sm flex items-center justify-center">
                    <Activity className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Preview unavailable</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-300">
                Live
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Last updated <span className="font-medium text-foreground">3 minutes ago</span></p>
            </div>

            <div className="space-y-4 pt-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Domain</p>
                <p className="font-medium">app.caudals.com</p>
                <Button variant="link" className="h-auto p-0 text-green-600 hover:text-green-700">
                  + Add custom domain
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>admin / main</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span>branch <span className="font-medium text-foreground">main</span></span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" size="icon">
                <FileText className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Activity className="h-4 w-4" />
              </Button>
              <Button className="bg-black text-white hover:bg-black/90">
                Visit site
              </Button>
            </div>
          </div>
        </div>

        {/* Activity Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Activity</h2>
              <p className="text-sm text-muted-foreground">Recent changes made to your platform</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="bg-muted/50">
                Live
              </Button>
              <Button variant="ghost" size="sm">
                Previews
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="grid grid-cols-12 gap-4 border-b bg-muted/40 px-6 py-3 text-xs font-medium text-muted-foreground">
              <div className="col-span-6">Activity</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-3">Changes</div>
            </div>

            <div className="divide-y">
              {[1, 2, 3].map((_, i) => (
                <div key={i} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/50 transition-colors">
                  <div className="col-span-6 flex items-center gap-3">
                    <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
                      <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Manual Update</p>
                      <p className="text-xs text-muted-foreground">Aug 22, 5:00 PM</p>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <div className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-300">
                      <div className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                      Successful
                    </div>
                  </div>
                  <div className="col-span-3">
                    {/* Empty for now as per design */}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
