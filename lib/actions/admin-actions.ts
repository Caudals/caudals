"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
        payment_status
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

  if (
    datasetRequest?.reward_amount &&
    datasetRequest.payment_status === "paid"
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
    console.log("⚠️ Skipping payout - dataset not paid or no reward amount");
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
