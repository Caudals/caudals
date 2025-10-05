import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { AnalyticsCharts } from "@/components/dashboard/analytics-charts";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

export default function AnalyticsPage() {
  const metrics = [
    {
      title: "Avg. Completion Time",
      value: "4.2 days",
      change: "-12%",
      trend: "down",
      icon: TrendingDown,
    },
    {
      title: "Quality Score",
      value: "94.5%",
      change: "+2.3%",
      trend: "up",
      icon: TrendingUp,
    },
    {
      title: "Contributor Engagement",
      value: "87%",
      change: "+5.1%",
      trend: "up",
      icon: Activity,
    },
  ];

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar collapsible="icon" />
      <SidebarInset>
        <DashboardHeader
          title="Analytics"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Analytics" },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Performance Analytics
            </h2>
            <p className="text-muted-foreground">
              Track and analyze your dataset collection performance
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {metrics.map((metric) => (
              <Card key={metric.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {metric.title}
                  </CardTitle>
                  <metric.icon
                    className={`h-4 w-4 ${
                      metric.trend === "up"
                        ? "text-emerald-600"
                        : "text-blue-600"
                    }`}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metric.value}</div>
                  <p
                    className={`text-xs ${
                      metric.trend === "up"
                        ? "text-emerald-600"
                        : "text-blue-600"
                    }`}
                  >
                    {metric.change} from last month
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <AnalyticsCharts />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
