import Link from "next/link";
import {
  FileText,
  Upload,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SidebarTrigger,
  SidebarHeader as SidebarHeaderComponent,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const stats = [
  {
    title: "Active Requests",
    value: "12",
    change: "+2 this month",
    icon: FileText,
    trend: "up" as const,
  },
  {
    title: "Total Submissions",
    value: "1,847",
    change: "+348 this week",
    icon: Upload,
    trend: "up" as const,
  },
  {
    title: "Approved",
    value: "1,234",
    change: "67% approval rate",
    icon: CheckCircle,
    trend: "neutral" as const,
  },
  {
    title: "Total Spend",
    value: "$12,482",
    change: "+15% vs last month",
    icon: DollarSign,
    trend: "up" as const,
  },
];

const recentRequests = [
  {
    id: 1,
    title: "Medical Image Classification",
    submissions: 234,
    approved: 189,
    status: "active" as const,
    deadline: "2024-02-15",
  },
  {
    id: 2,
    title: "Voice Recognition Dataset",
    submissions: 456,
    approved: 401,
    status: "active" as const,
    deadline: "2024-02-20",
  },
  {
    id: 3,
    title: "Product Image Segmentation",
    submissions: 128,
    approved: 98,
    status: "review" as const,
    deadline: "2024-02-10",
  },
];

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild>
            <Link href="/dashboard/requests/new">
              <Plus className="mr-2 h-4 w-4" />
              New Request
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-6 p-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground">
              Here's an overview of your dataset requests
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.title} className="hover-lift">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {stat.trend === "up" && (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    )}
                    {stat.change}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent Requests */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Requests</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/dashboard/requests">View all</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent"
                  >
                    <div className="flex-1">
                      <Link
                        href={`/dashboard/requests/${request.id}`}
                        className="font-medium hover:underline"
                      >
                        {request.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Upload className="h-3 w-3" />
                          {request.submissions} submissions
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {request.approved} approved
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Due {request.deadline}
                        </span>
                      </div>
                    </div>
                    <div>
                      {request.status === "active" && (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                          Active
                        </span>
                      )}
                      {request.status === "review" && (
                        <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-700 ring-1 ring-inset ring-yellow-600/20">
                          In Review
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="hover-lift cursor-pointer transition-all hover:border-primary">
              <CardHeader>
                <CardTitle className="text-base">Create New Request</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Start a new dataset collection campaign and define your
                  requirements
                </p>
                <Button asChild className="w-full">
                  <Link href="/dashboard/requests/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Request
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="hover-lift cursor-pointer transition-all hover:border-primary">
              <CardHeader>
                <CardTitle className="text-base">
                  Review Submissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Review pending submissions and approve quality contributions
                </p>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/dashboard/submissions">View Submissions</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
