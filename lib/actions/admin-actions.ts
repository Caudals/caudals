"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getDatasetBudgetSummary } from "@/lib/actions/payment-actions";
import {
  DatasetCategory,
  DataType,
  DatasetStatus,
} from "@/types/dataset";
import { ApprovalStatus } from "@/types/database";

type PlatformSettings = Record<string, unknown>;

// Check if user is admin
export async function isAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin";
}

// Get pending dataset requests
export async function getPendingDatasetRequests() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data, error } = await supabase
    .from("dataset_requests")
    .select(
      `
      *,
      profiles:created_by (
        id,
        full_name
      )
    `
    )
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching pending requests:", error);
    return { error: error.message };
  }

  return { data };
}

export async function getAdminDatasetRequests() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data, error } = await supabase
    .from("dataset_requests")
    .select(
      `
      *,
      profiles:created_by (
        id,
        full_name,
        avatar_url
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching dataset requests for admin:", error);
    return { error: error.message };
  }

  return { data };
}

export interface AdminDatasetUpdates {
  title?: string;
  description?: string;
  category?: DatasetCategory;
  data_type?: DataType;
  status?: DatasetStatus;
  samples_needed?: number;
  samples_collected?: number;
  reward_amount?: number;
  currency?: string;
  deadline?: string;
  quality_criteria?: string[];
  requirements?: string[];
  image_url?: string | null;
  featured?: boolean;
}

export async function adminUpdateDatasetRequest(
  id: string,
  updates: AdminDatasetUpdates
) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const payload = Object.fromEntries(
    Object.entries(updates).filter(
      ([, value]) => value !== undefined
    )
  );

  if (Object.keys(payload).length === 0) {
    return { error: "No updates provided" };
  }

  const { data, error } = await supabase
    .from("dataset_requests")
    .update(payload)
    .eq("id", id)
    .select(
      `
      *,
      profiles:created_by (
        id,
        full_name,
        avatar_url
      )
    `
    )
    .single();

  if (error) {
    console.error("Error updating dataset request as admin:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath(`/browse/${id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  revalidatePath("/admin/requests");

  return { data };
}

export async function adminUpdateDatasetApproval(
  id: string,
  approvalStatus: ApprovalStatus
) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data, error } = await supabase
    .from("dataset_requests")
    .update({ approval_status: approvalStatus })
    .eq("id", id)
    .select(
      `
      *,
      profiles:created_by (
        id,
        full_name,
        avatar_url
      )
    `
    )
    .single();

  if (error) {
    console.error("Error updating dataset approval status:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath(`/browse/${id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  revalidatePath("/admin/requests");

  return { data };
}

export async function adminDeleteDatasetRequest(id: string) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting dataset request via admin:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  revalidatePath("/admin/requests");

  return { success: true };
}

export async function adminBulkUpdateDatasetApproval(
  ids: string[],
  approvalStatus: ApprovalStatus
) {
  if (ids.length === 0) {
    return { error: "No dataset IDs provided" };
  }

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .update({
      approval_status: approvalStatus,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (error) {
    console.error("Error bulk updating approval status:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  revalidatePath("/admin/requests");
  ids.forEach((id) => {
    revalidatePath(`/browse/${id}`);
  });

  return { success: true };
}

export async function adminBulkUpdateDatasetStatus(
  ids: string[],
  status: DatasetStatus
) {
  if (ids.length === 0) {
    return { error: "No dataset IDs provided" };
  }

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (error) {
    console.error("Error bulk updating dataset status:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  ids.forEach((id) => {
    revalidatePath(`/browse/${id}`);
  });

  return { success: true };
}

export async function adminBulkUpdateDatasetRequests(
  ids: string[],
  updates: AdminDatasetUpdates
) {
  if (ids.length === 0) {
    return { error: "No dataset IDs provided" };
  }

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const payload = Object.fromEntries(
    Object.entries(updates).filter(
      ([, value]) => value !== undefined
    )
  );

  if (Object.keys(payload).length === 0) {
    return { error: "No updates provided" };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (error) {
    console.error("Error bulk updating dataset requests:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  ids.forEach((id) => {
    revalidatePath(`/browse/${id}`);
  });

  return { success: true };
}

export async function adminBulkDeleteDatasetRequests(ids: string[]) {
  if (ids.length === 0) {
    return { error: "No dataset IDs provided" };
  }

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .delete()
    .in("id", ids);

  if (error) {
    console.error("Error bulk deleting dataset requests:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  revalidatePath("/admin/requests");
  ids.forEach((id) => {
    revalidatePath(`/browse/${id}`);
  });

  return { success: true };
}

// Get pending submissions
export async function getPendingSubmissions() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data, error } = await supabase
    .from("submissions")
    .select(
      `
      *,
      dataset_requests:dataset_request_id (
        id,
        title
      ),
      profiles:contributor_id (
        id,
        full_name
      )
    `
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching pending submissions:", error);
    return { error: error.message };
  }

  return { data };
}

// Approve dataset request
export async function approveDatasetRequest(requestId: string, notes?: string) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("dataset_requests")
    .update({
      approval_status: "approved",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      admin_notes: notes,
    })
    .eq("id", requestId)
    .select()
    .single();

  if (error) {
    console.error("Error approving request:", error);
    return { error: error.message };
  }

  // Log activity
  await supabase.from("admin_activity_log").insert({
    admin_id: user?.id,
    action_type: "approve_request",
    target_type: "dataset_request",
    target_id: requestId,
    notes,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  revalidatePath("/browse");

  return { data };
}

// Reject dataset request
export async function rejectDatasetRequest(requestId: string, notes: string) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("dataset_requests")
    .update({
      approval_status: "rejected",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      admin_notes: notes,
    })
    .eq("id", requestId)
    .select()
    .single();

  if (error) {
    console.error("Error rejecting request:", error);
    return { error: error.message };
  }

  // Log activity
  await supabase.from("admin_activity_log").insert({
    admin_id: user?.id,
    action_type: "reject_request",
    target_type: "dataset_request",
    target_id: requestId,
    notes,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/requests");

  return { data };
}

// Approve submission
export async function approveSubmission(submissionId: string, notes?: string) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // First, get submission details with dataset info
  const { data: submission, error: fetchError } = await supabase
    .from("submissions")
    .select(
      `
      id,
      contributor_id,
      dataset_request_id,
      dataset_requests:dataset_request_id (
        reward_amount,
        payment_status,
        paid_amount
      )
    `
    )
    .eq("id", submissionId)
    .single();

  if (fetchError || !submission) {
    console.error("Error fetching submission:", fetchError);
    return { error: "Submission not found" };
  }

  // Update submission status
  const { data, error } = await supabase
    .from("submissions")
    .update({
      status: "approved",
      notes,
    })
    .eq("id", submissionId)
    .select()
    .single();

  if (error) {
    console.error("Error approving submission:", error);
    return { error: error.message };
  }

  // Log activity
  await supabase.from("admin_activity_log").insert({
    admin_id: user?.id,
    action_type: "approve_submission",
    target_type: "submission",
    target_id: submissionId,
    notes,
  });

  // Add funds to contributor's wallet
  const datasetRequest = Array.isArray(submission.dataset_requests)
    ? submission.dataset_requests[0]
    : submission.dataset_requests;

  if (datasetRequest?.reward_amount) {
    const adminClient = createAdminClient();

    const budgetSummary = await getDatasetBudgetSummary(
      submission.dataset_request_id,
      adminClient
    );

    if (
      budgetSummary.data &&
      budgetSummary.data.rewardCents > 0 &&
      budgetSummary.data.remainingForPayoutCents >=
        Math.round(Number(datasetRequest.reward_amount) * 100)
    ) {
      const { payoutToContributor } = await import(
        "@/lib/actions/payment-actions"
      );

      const payoutResult = await payoutToContributor(
        submissionId,
        submission.contributor_id,
        datasetRequest.reward_amount,
        submission.dataset_request_id
      );

      if (payoutResult.error) {
        console.error("Payout to wallet failed:", payoutResult.error);
        // Don't fail the approval, but log the error
        // The payout can be retried manually if needed
      } else {
        console.log("✅ Payout to wallet successful:", payoutResult.data);
      }
    } else {
      console.log(
        "⚠️ Skipping payout - insufficient funded budget",
        {
          budget: budgetSummary.data,
          rewardCents: Math.round(Number(datasetRequest.reward_amount) * 100),
        }
      );
    }
  } else {
    console.log("⚠️ Skipping payout - no reward amount");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/submissions");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/contributor");
  revalidatePath("/dashboard/contributions");

  return { data };
}

// Reject submission
export async function rejectSubmission(submissionId: string, notes: string) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("submissions")
    .update({
      status: "rejected",
      notes,
    })
    .eq("id", submissionId)
    .select()
    .single();

  if (error) {
    console.error("Error rejecting submission:", error);
    return { error: error.message };
  }

  // Log activity
  await supabase.from("admin_activity_log").insert({
    admin_id: user?.id,
    action_type: "reject_submission",
    target_type: "submission",
    target_id: submissionId,
    notes,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/submissions");

  return { data };
}

// Get admin dashboard stats
export async function getAdminDashboardStats() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  // Get pending requests count
  const { count: pendingRequests } = await supabase
    .from("dataset_requests")
    .select("*", { count: "exact", head: true })
    .eq("approval_status", "pending");

  // Get pending submissions count
  const { count: pendingSubmissions } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  // Get total submissions (all-time)
  const { count: totalSubmissions } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true });

  // Get total users
  const { count: totalUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  // Get total approved datasets
  const { count: approvedDatasets } = await supabase
    .from("dataset_requests")
    .select("*", { count: "exact", head: true })
    .eq("approval_status", "approved");

  return {
    data: {
      pendingRequests: pendingRequests || 0,
      pendingSubmissions: pendingSubmissions || 0,
      totalSubmissions: totalSubmissions || 0,
      totalUsers: totalUsers || 0,
      approvedDatasets: approvedDatasets || 0,
    },
  };
}

// Platform settings (admin-only)
export async function getPlatformSettings() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .select("key, value");

  if (error) {
    console.error("Error fetching platform settings:", error);
    return { error: error.message };
  }

  const settings: PlatformSettings = {};
  data?.forEach((row) => {
    settings[row.key] = row.value;
  });

  return { data: settings };
}

export async function upsertPlatformSetting(
  key: string,
  value: unknown
) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("platform_settings")
    .upsert({
      key,
      value,
      updated_by: user?.id ?? null,
    });

  if (error) {
    console.error("Error upserting platform setting:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/settings");
  return { success: true };
}

// Get recent admin activity
export async function getRecentAdminActivity() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data, error } = await supabase
    .from("admin_activity_log")
    .select(
      `
      *,
      profiles:admin_id (
        full_name
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching activity log:", error);
    return { error: error.message };
  }

  return { data };
}

// Admin overview (hero + activity)
export async function getAdminOverview() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const [statsRes, activityRes, highlightRes] = await Promise.all([
    getAdminDashboardStats(),
    supabase
      .from("admin_activity_log")
      .select(
        `
        id,
        action_type,
        target_type,
        target_id,
        notes,
        created_at,
        profiles:admin_id (
          full_name
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("dataset_requests")
      .select(
        `
        id,
        title,
        image_url,
        approval_status,
        status,
        featured,
        updated_at,
        created_at,
        profiles:created_by (
          full_name
        )
      `
      )
      .order("featured", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if ("error" in statsRes) {
    return statsRes;
  }

  type Highlight = {
    id: string;
    title: string | null;
    image_url: string | null;
    approval_status: string | null;
    status: string | null;
    featured: boolean | null;
    updated_at: string | null;
    created_at: string | null;
    profiles?:
      | {
          full_name: string | null;
        }
      | null;
  };

  const highlight = (highlightRes.data as Highlight | null) || null;

  return {
    data: {
      stats: statsRes.data,
      activity: activityRes.data || [],
      highlight,
      lastUpdated:
        activityRes.data?.[0]?.created_at ??
        highlight?.updated_at ??
        highlight?.created_at ??
        null,
    },
  };
}

// Payments overview
export async function getAdminPaymentsOverview() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select(
      `
      id,
      user_id,
      type,
      direction,
      amount,
      fee_amount,
      net_amount,
      currency,
      status,
      reference_id,
      dataset_request_id,
      submission_id,
      created_at
    `
    )
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) {
    console.error("Error fetching transactions:", error);
    return { error: error.message };
  }

  const completed = transactions?.filter((t) => t.status === "completed") ?? [];
  const totalVolume = completed.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const platformCommission = completed.reduce(
    (sum, t) => sum + Number(t.fee_amount || 0),
    0
  );
  const payouts = completed.filter((t) => t.type === "submission_payout");
  const payoutVolume = payouts.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const pendingPayouts =
    transactions?.filter(
      (t) => t.type === "submission_payout" && t.status === "pending"
    ) ?? [];

  return {
    data: {
      totals: {
        totalVolume,
        platformCommission,
        payoutVolume,
        totalTransactions: transactions?.length ?? 0,
        completedCount: completed.length,
        pendingPayouts: pendingPayouts.length,
      },
      transactions: transactions ?? [],
    },
  };
}

// Admin analytics snapshot
export async function getAdminAnalyticsSummary() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const [usersRes, datasetsRes, submissionsRes] = await Promise.all([
    supabase.from("profiles").select("role, created_at"),
    supabase
      .from("dataset_requests")
      .select("status, approval_status, created_at"),
    supabase.from("submissions").select("status, created_at"),
  ]);

  if (usersRes.error || datasetsRes.error || submissionsRes.error) {
    const err =
      usersRes.error?.message ||
      datasetsRes.error?.message ||
      submissionsRes.error?.message;
    return { error: err || "Failed to load analytics" };
  }

  const users = usersRes.data ?? [];
  const datasets = datasetsRes.data ?? [];
  const submissions = submissionsRes.data ?? [];

  const usersByRole = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role as string] = (acc[u.role as string] || 0) + 1;
    return acc;
  }, {});

  const datasetsByStatus = datasets.reduce<Record<string, number>>((acc, d) => {
    acc[d.status as string] = (acc[d.status as string] || 0) + 1;
    acc[d.approval_status as string] =
      (acc[d.approval_status as string] || 0) + 1;
    return acc;
  }, {});

  const submissionsByStatus = submissions.reduce<Record<string, number>>(
    (acc, s) => {
      acc[s.status as string] = (acc[s.status as string] || 0) + 1;
      return acc;
    },
    {}
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailySeries = Array.from({ length: 31 }).map((_, idx) => {
    const date = new Date(thirtyDaysAgo);
    date.setDate(date.getDate() + idx);
    const key = date.toISOString().split("T")[0];
    return {
      date: key,
      requests: datasets.filter(
        (d) => d.created_at && d.created_at.startsWith(key)
      ).length,
      submissions: submissions.filter(
        (s) => s.created_at && s.created_at.startsWith(key)
      ).length,
      users: users.filter(
        (u) => u.created_at && u.created_at.startsWith(key)
      ).length,
    };
  });

  return {
    data: {
      usersByRole,
      datasetsByStatus,
      submissionsByStatus,
      dailySeries,
    },
  };
}

// Update user role
export async function updateUserRole(
  userId: string,
  role: "contributor" | "requester" | "admin"
) {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error updating user role:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/users");

  return { data };
}

// Get all users (for admin management)
export async function getAllUsers() {
  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching users:", error);
    return { error: error.message };
  }

  return { data };
}
