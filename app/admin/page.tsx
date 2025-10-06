import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAdminDashboardStats } from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Users,
  CheckCircle,
  Database,
  AlertCircle,
  Send,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AdminDashboard() {
  await requireAdmin();
  const statsResult = await getAdminDashboardStats();

  if ("error" in statsResult) {
    return <div>Error loading stats</div>;
  }

  const stats = statsResult.data;

  const statCards = [
    {
      title: "Pending Requests",
      value: stats.pendingRequests.toString(),
      description: "Dataset requests awaiting approval",
      icon: AlertCircle,
      color: "text-orange-600",
      bgColor: "bg-orange-500/10",
      href: "/admin/requests",
    },
    {
      title: "Pending Submissions",
      value: stats.pendingSubmissions.toString(),
      description: "Contributions to review",
      icon: Send,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
      href: "/admin/submissions",
    },
    {
      title: "Approved Datasets",
      value: stats.approvedDatasets.toString(),
      description: "Active on platform",
      icon: CheckCircle,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Total Users",
      value: stats.totalUsers.toString(),
      description: "Registered users",
      icon: Users,
      color: "text-violet-600",
      bgColor: "bg-violet-500/10",
      href: "/admin/users",
    },
  ];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-lg text-muted-foreground">
            Manage platform content and users
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card
              key={stat.title}
              className="hover:shadow-lg transition-shadow"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-1">{stat.value}</div>
                <p className="text-xs text-muted-foreground mb-3">
                  {stat.description}
                </p>
                {stat.href && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    asChild
                  >
                    <Link href={stat.href}>View All</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button asChild>
              <Link href="/admin/requests">
                <FileText className="mr-2 h-4 w-4" />
                Review Dataset Requests
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/submissions">
                <Database className="mr-2 h-4 w-4" />
                Review Submissions
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/users">
                <Users className="mr-2 h-4 w-4" />
                Manage Users
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/browse">View Browse Page</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
