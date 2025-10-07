"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  DollarSign, 
  Upload, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Users
} from "lucide-react";

interface ContributorStats {
  totalEarnings: number;
  totalSubmissions: number;
  approvedSubmissions: number;
  pendingSubmissions: number;
  activeProjects: number;
  averageEarning: number;
}

export function ContributorStatsCards() {
  const [stats, setStats] = useState<ContributorStats>({
    totalEarnings: 0,
    totalSubmissions: 0,
    approvedSubmissions: 0,
    pendingSubmissions: 0,
    activeProjects: 0,
    averageEarning: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user's submissions
        const { data: submissions } = await supabase
          .from('submissions')
          .select(`
            *,
            dataset_requests (
              reward_amount,
              status
            )
          `)
          .eq('contributor_id', user.id);

        if (submissions) {
          const approvedSubmissions = submissions.filter(s => s.status === 'approved');
          const pendingSubmissions = submissions.filter(s => s.status === 'pending');
          const totalEarnings = approvedSubmissions.reduce((sum, s) => 
            sum + (s.dataset_requests?.reward_amount || 0), 0
          );
          const activeProjects = new Set(submissions.map(s => s.dataset_request_id)).size;
          const averageEarning = approvedSubmissions.length > 0 
            ? totalEarnings / approvedSubmissions.length 
            : 0;

          setStats({
            totalEarnings,
            totalSubmissions: submissions.length,
            approvedSubmissions: approvedSubmissions.length,
            pendingSubmissions: pendingSubmissions.length,
            activeProjects,
            averageEarning,
          });
        }
      } catch (error) {
        console.error('Error fetching contributor stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const cards = [
    {
      title: "Total Earnings",
      value: `$${stats.totalEarnings.toFixed(2)}`,
      description: "Lifetime earnings from contributions",
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Total Submissions",
      value: stats.totalSubmissions.toString(),
      description: "All your contributions",
      icon: Upload,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Approved",
      value: stats.approvedSubmissions.toString(),
      description: "Successfully approved submissions",
      icon: CheckCircle,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
    },
    {
      title: "Pending",
      value: stats.pendingSubmissions.toString(),
      description: "Awaiting review",
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      title: "Active Projects",
      value: stats.activeProjects.toString(),
      description: "Projects you're contributing to",
      icon: Users,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Avg. Earning",
      value: `$${stats.averageEarning.toFixed(2)}`,
      description: "Per approved submission",
      icon: TrendingUp,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
