"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Get all contributions for the current user
export async function getUserContributionsDetailed() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("submissions")
    .select(
      `
      *,
      dataset_requests:dataset_request_id (
        id,
        title,
        reward_amount,
        currency,
        data_type,
        status
      )
    `
    )
    .eq("contributor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching contributions:", error);
    return { error: error.message };
  }

  return { data };
}

// Get earnings summary for contributor
export async function getUserEarnings() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      totalEarnings: 0,
      pendingEarnings: 0,
      approvedSubmissions: 0,
      pendingSubmissions: 0,
      rejectedSubmissions: 0,
      totalSubmissions: 0,
    };
  }

  const { data: submissions } = await supabase
    .from("submissions")
    .select(
      `
      status,
      dataset_requests:dataset_request_id (
        reward_amount
      )
    `
    )
    .eq("contributor_id", user.id);

  const stats = {
    totalEarnings: 0,
    pendingEarnings: 0,
    approvedSubmissions: 0,
    pendingSubmissions: 0,
    rejectedSubmissions: 0,
    totalSubmissions: submissions?.length || 0,
  };

  submissions?.forEach((sub) => {
    const datasetRequest: { reward_amount?: number } | undefined =
      Array.isArray(sub.dataset_requests)
        ? sub.dataset_requests[0]
        : sub.dataset_requests;
    const rewardAmount = Number(datasetRequest?.reward_amount) || 0;

    if (sub.status === "approved") {
      stats.approvedSubmissions++;
      stats.totalEarnings += rewardAmount;
    } else if (sub.status === "pending") {
      stats.pendingSubmissions++;
      stats.pendingEarnings += rewardAmount;
    } else if (sub.status === "rejected") {
      stats.rejectedSubmissions++;
    }
  });

  return stats;
}

// Update own submission (only if pending)
export async function updateOwnSubmission(
  submissionId: string,
  updates: {
    notes?: string;
    file_urls?: string[];
  }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Only allow updating own pending submissions
  const { data, error } = await supabase
    .from("submissions")
    .update(updates)
    .eq("id", submissionId)
    .eq("contributor_id", user.id)
    .eq("status", "pending")
    .select()
    .single();

  if (error) {
    console.error("Error updating submission:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/contributions");
  return { data };
}

// Delete own submission (only if pending)
export async function deleteOwnSubmission(submissionId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId)
    .eq("contributor_id", user.id)
    .eq("status", "pending");

  if (error) {
    console.error("Error deleting submission:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/contributions");
  return { success: true };
}
