import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, CheckCircle, DollarSign } from "lucide-react";

export function StatsCards() {
  const stats = [
    {
      title: "Active Requests",
      value: "12",
      description: "+2 from last month",
      icon: FileText,
      trend: "up",
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Total Contributors",
      value: "2,350",
      description: "+180 from last month",
      icon: Users,
      trend: "up",
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Approved Submissions",
      value: "8,420",
      description: "+1,234 from last month",
      icon: CheckCircle,
      trend: "up",
      color: "text-violet-600",
      bgColor: "bg-violet-500/10",
    },
    {
      title: "Total Spent",
      value: "$45,231",
      description: "+$8,420 from last month",
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
