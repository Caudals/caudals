import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, CheckCircle, DollarSign } from "lucide-react";
import { getUserDashboardStats } from "@/lib/actions/dashboard-actions";
import { getServerTranslator } from "@/lib/i18n/server";

export async function StatsCards() {
  const [dashboardStats, t] = await Promise.all([
    getUserDashboardStats(),
    getServerTranslator(),
  ]);

  const stats = [
    {
      title: t("Active Requests"),
      value: dashboardStats.activeRequests.toString(),
      description: t("Currently active datasets"),
      icon: FileText,
      trend: "up",
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
    },
    {
      title: t("Total Contributors"),
      value: dashboardStats.totalContributors.toLocaleString(),
      description: t("Unique contributors"),
      icon: Users,
      trend: "up",
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: t("Approved Submissions"),
      value: dashboardStats.approvedSubmissions.toLocaleString(),
      description: t("Total approved"),
      icon: CheckCircle,
      trend: "up",
      color: "text-violet-600",
      bgColor: "bg-violet-500/10",
    },
    {
      title: t("Total Spent"),
      value: `$${dashboardStats.totalSpent.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      description: t("Total rewards paid"),
      icon: DollarSign,
      trend: "up",
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="hover-lift transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <div className={`rounded-lg p-2 ${stat.bgColor}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
