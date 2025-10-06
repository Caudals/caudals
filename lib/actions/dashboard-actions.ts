"use server";

import { createClient } from "@/lib/supabase/server";

export async function getUserDashboardStats() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      activeRequests: 0,
      totalContributors: 0,
      approvedSubmissions: 0,
      totalSpent: 0,
    };
  }

  // Get user's dataset requests
  const { data: requests } = await supabase
    .from("dataset_requests")
    .select("id, status, samples_collected, reward_amount")
    .eq("created_by", user.id);

  // Get submissions for user's requests
  const requestIds = requests?.map((r) => r.id) || [];
  const { data: submissions } = await supabase
    .from("submissions")
    .select("contributor_id, status")
    .in("dataset_request_id", requestIds);

  const activeRequests =
    requests?.filter((r) => r.status === "active").length || 0;

  const uniqueContributors = new Set(
    submissions?.map((s) => s.contributor_id) || []
  );

  const approvedSubmissions =
    submissions?.filter((s) => s.status === "approved").length || 0;

  const totalSpent =
    requests?.reduce((sum, r) => {
      return sum + r.samples_collected * Number(r.reward_amount);
    }, 0) || 0;

  return {
    activeRequests,
    totalContributors: uniqueContributors.size,
    approvedSubmissions,
    totalSpent,
  };
}

export async function getRecentActivity() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  // Get user's dataset requests
  const { data: requests } = await supabase
    .from("dataset_requests")
    .select("id")
    .eq("created_by", user.id);

  const requestIds = requests?.map((r) => r.id) || [];

  // Get recent submissions to user's requests
  const { data: recentSubmissions } = await supabase
    .from("submissions")
    .select(
      `
      *,
      dataset_requests:dataset_request_id (
        title
      ),
      profiles:contributor_id (
        full_name
      )
    `
    )
    .in("dataset_request_id", requestIds)
    .order("created_at", { ascending: false })
    .limit(20);

  return recentSubmissions || [];
}

export async function getActivityChartData() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  // Get user's dataset requests
  const { data: requests } = await supabase
    .from("dataset_requests")
    .select("id")
    .eq("created_by", user.id);

  const requestIds = requests?.map((r) => r.id) || [];

  // Get submissions grouped by date for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: submissions } = await supabase
    .from("submissions")
    .select("created_at, status")
    .in("dataset_request_id", requestIds)
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  // Group by day
  const dailyData: Record<string, { date: string; submissions: number }> = {};

  submissions?.forEach((sub) => {
    const date = new Date(sub.created_at).toISOString().split("T")[0];
    if (!dailyData[date]) {
      dailyData[date] = { date, submissions: 0 };
    }
    dailyData[date].submissions++;
  });

  return Object.values(dailyData);
}

export async function getContributorStats() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  // Get user's dataset requests
  const { data: requests } = await supabase
    .from("dataset_requests")
    .select("id, title")
    .eq("created_by", user.id);

  const requestIds = requests?.map((r) => r.id) || [];

  // Get top contributors
  const { data: submissions } = await supabase
    .from("submissions")
    .select(
      `
      contributor_id,
      status,
      profiles:contributor_id (
        full_name,
        avatar_url
      )
    `
    )
    .in("dataset_request_id", requestIds);

  // Group by contributor
  const contributorMap: Record<
    string,
    {
      id: string;
      name: string;
      avatar: string | null;
      totalSubmissions: number;
      approvedSubmissions: number;
    }
  > = {};

  submissions?.forEach((sub: any) => {
    const contributorId = sub.contributor_id;
    if (!contributorMap[contributorId]) {
      contributorMap[contributorId] = {
        id: contributorId,
        name: sub.profiles?.full_name || "Unknown",
        avatar: sub.profiles?.avatar_url || null,
        totalSubmissions: 0,
        approvedSubmissions: 0,
      };
    }
    contributorMap[contributorId].totalSubmissions++;
    if (sub.status === "approved") {
      contributorMap[contributorId].approvedSubmissions++;
    }
  });

  return Object.values(contributorMap).sort(
    (a, b) => b.approvedSubmissions - a.approvedSubmissions
  );
}
