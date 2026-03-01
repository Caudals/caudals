"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getDatasetBudgetSummary } from "@/lib/actions/payment-actions";
import { deriveDatasetStatus } from "@/lib/utils/dataset-status";
import {
  DatasetCategory,
  DataType,
  DatasetStatus,
} from "@/types/dataset";
import { ApprovalStatus } from "@/types/database";
import type { DatasetRequestRow } from "@/types/admin";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";
import {
  adminActivityFiltersSchema,
  adminSupportTicketListSchema,
  adminSupportTicketUpdateSchema,
  adminWaitlistListSchema,
  adminWaitlistStatusUpdateSchema,
} from "@/lib/validators/requester-admin";

type PlatformSettings = Record<string, unknown>;

type AdminActivityInput = {
  adminId: string | undefined;
  actionType: string;
  targetType: string;
  targetId: string;
  notes?: string | null;
};

async function writeAdminActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: AdminActivityInput
): Promise<ActionError | null> {
  if (!input.adminId) {
    return actionError("FORBIDDEN", "Admin user context missing");
  }

  const { error } = await supabase.from("admin_activity_log").insert({
    admin_id: input.adminId,
    action_type: input.actionType,
    target_type: input.targetType,
    target_id: input.targetId,
    notes: input.notes ?? null,
  });

  if (error) {
    return actionError(
      "DB_ERROR",
      `Operation completed but activity log failed: ${error.message}`
    );
  }

  return null;
}

function toDayStartIso(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toDayEndIso(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

type SupportTicketMessage = {
  id: string;
  role: "requester" | "admin" | "system";
  body: string;
  created_at: string;
};

function parseSupportMessages(messages: unknown): SupportTicketMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const roleRaw = String(row.role ?? "system");
      const role: SupportTicketMessage["role"] =
        roleRaw === "requester" || roleRaw === "admin" ? roleRaw : "system";
      const body = String(row.body ?? "");
      const createdAt = String(row.created_at ?? new Date().toISOString());

      return {
        id: String(row.id ?? randomUUID()),
        role,
        body,
        created_at: createdAt,
      };
    })
    .filter((entry) => entry.body.trim().length > 0);
}

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

  const normalized =
    data?.map((item: DatasetRequestRow) => ({
      ...item,
      status: deriveDatasetStatus(item.approval_status, item.payment_status),
    })) ?? [];

  return { data: normalized };
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

  const normalized =
    data?.map((item: DatasetRequestRow) => ({
      ...item,
      status: deriveDatasetStatus(item.approval_status, item.payment_status),
    })) ?? [];

  return { data: normalized };
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "update_dataset_request",
    targetType: "dataset_request",
    targetId: id,
    notes: `Updated fields: ${Object.keys(payload).join(", ")}`,
  });
  if (activityResult) {
    return activityResult;
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "set_dataset_approval",
    targetType: "dataset_request",
    targetId: id,
    notes: `Approval set to "${approvalStatus}".`,
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/browse");
  revalidatePath(`/browse/${id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  revalidatePath("/admin/requests");

  return { data };
}

export async function adminDeleteDatasetRequest(id: string) {
  const supabase = createAdminClient("admin_operations");
  const authClient = await createClient();
  // Admin check still required to avoid accidental calls
  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await authClient.auth.getUser();

  const { error } = await supabase
    .from("dataset_requests")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting dataset request via admin:", error);
    return { error: error.message };
  }

  const activityResult = await writeAdminActivity(authClient, {
    adminId: user?.id,
    actionType: "delete_dataset_request",
    targetType: "dataset_request",
    targetId: id,
    notes: "Dataset request removed by admin.",
  });
  if (activityResult) {
    return activityResult;
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
  const uniqueIds = Array.from(new Set(ids));

  if (uniqueIds.length === 0) {
    return { error: "No dataset IDs provided" };
  }

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: matchedRows, error: matchError } = await supabase
    .from("dataset_requests")
    .select("id")
    .in("id", uniqueIds);

  if (matchError) {
    return { error: matchError.message };
  }

  const matchedIds = new Set((matchedRows ?? []).map((row) => row.id as string));
  if (matchedIds.size !== uniqueIds.length) {
    const missing = uniqueIds.filter((id) => !matchedIds.has(id));
    return {
      error: `Bulk approval aborted. ${missing.length} dataset(s) were not found: ${missing.join(", ")}`,
    };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .update({
      approval_status: approvalStatus,
      updated_at: new Date().toISOString(),
    })
    .in("id", uniqueIds);

  if (error) {
    console.error("Error bulk updating approval status:", error);
    return { error: error.message };
  }

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "bulk_set_dataset_approval",
    targetType: "dataset_request",
    targetId: uniqueIds[0],
    notes: `Set approval to "${approvalStatus}" for ${uniqueIds.length} dataset(s). Rollback: restore prior approvals from audit snapshot.`,
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  revalidatePath("/admin/requests");
  uniqueIds.forEach((id) => {
    revalidatePath(`/browse/${id}`);
  });

  return { success: true, requested: uniqueIds.length, updated: uniqueIds.length };
}

export async function adminBulkUpdateDatasetStatus(
  ids: string[],
  status: DatasetStatus
) {
  const uniqueIds = Array.from(new Set(ids));

  if (uniqueIds.length === 0) {
    return { error: "No dataset IDs provided" };
  }

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: matchedRows, error: matchError } = await supabase
    .from("dataset_requests")
    .select("id")
    .in("id", uniqueIds);

  if (matchError) {
    return { error: matchError.message };
  }

  const matchedIds = new Set((matchedRows ?? []).map((row) => row.id as string));
  if (matchedIds.size !== uniqueIds.length) {
    const missing = uniqueIds.filter((id) => !matchedIds.has(id));
    return {
      error: `Bulk status update aborted. ${missing.length} dataset(s) were not found: ${missing.join(", ")}`,
    };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .in("id", uniqueIds);

  if (error) {
    console.error("Error bulk updating dataset status:", error);
    return { error: error.message };
  }

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "bulk_set_dataset_status",
    targetType: "dataset_request",
    targetId: uniqueIds[0],
    notes: `Set status to "${status}" for ${uniqueIds.length} dataset(s). Rollback: restore prior statuses from audit snapshot.`,
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  uniqueIds.forEach((id) => {
    revalidatePath(`/browse/${id}`);
  });

  return { success: true, requested: uniqueIds.length, updated: uniqueIds.length };
}

export async function adminBulkUpdateDatasetRequests(
  ids: string[],
  updates: AdminDatasetUpdates
) {
  const uniqueIds = Array.from(new Set(ids));

  if (uniqueIds.length === 0) {
    return { error: "No dataset IDs provided" };
  }

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload = Object.fromEntries(
    Object.entries(updates).filter(
      ([, value]) => value !== undefined
    )
  );

  if (Object.keys(payload).length === 0) {
    return { error: "No updates provided" };
  }

  const { data: matchedRows, error: matchError } = await supabase
    .from("dataset_requests")
    .select("id")
    .in("id", uniqueIds);

  if (matchError) {
    return { error: matchError.message };
  }

  const matchedIds = new Set((matchedRows ?? []).map((row) => row.id as string));
  if (matchedIds.size !== uniqueIds.length) {
    const missing = uniqueIds.filter((id) => !matchedIds.has(id));
    return {
      error: `Bulk edit aborted. ${missing.length} dataset(s) were not found: ${missing.join(", ")}`,
    };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .in("id", uniqueIds);

  if (error) {
    console.error("Error bulk updating dataset requests:", error);
    return { error: error.message };
  }

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "bulk_edit_dataset_requests",
    targetType: "dataset_request",
    targetId: uniqueIds[0],
    notes: `Updated fields [${Object.keys(payload).join(", ")}] for ${uniqueIds.length} dataset(s).`,
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  uniqueIds.forEach((id) => {
    revalidatePath(`/browse/${id}`);
  });

  return { success: true, requested: uniqueIds.length, updated: uniqueIds.length };
}

export async function adminBulkDeleteDatasetRequests(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids));

  if (uniqueIds.length === 0) {
    return { error: "No dataset IDs provided" };
  }

  const supabase = createAdminClient("admin_operations");
  const authClient = await createClient();

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const {
    data: { user },
  } = await authClient.auth.getUser();

  const { data: matchedRows, error: matchError } = await (supabase as any)
    .from("dataset_requests")
    .select("id")
    .in("id", uniqueIds);

  if (matchError) {
    return { error: matchError.message };
  }

  const matchedIds = new Set((matchedRows ?? []).map((row: { id: string }) => row.id));
  if (matchedIds.size !== uniqueIds.length) {
    const missing = uniqueIds.filter((id) => !matchedIds.has(id));
    return {
      error: `Bulk delete aborted. ${missing.length} dataset(s) were not found: ${missing.join(", ")}`,
    };
  }

  const { error } = await supabase
    .from("dataset_requests")
    .delete()
    .in("id", uniqueIds);

  if (error) {
    console.error("Error bulk deleting dataset requests:", error);
    return { error: error.message };
  }

  const activityResult = await writeAdminActivity(authClient, {
    adminId: user?.id,
    actionType: "bulk_delete_dataset_requests",
    targetType: "dataset_request",
    targetId: uniqueIds[0],
    notes: `Deleted ${uniqueIds.length} dataset(s). Rollback strategy: restore from DB backup/snapshot.`,
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/browse");
  revalidatePath("/admin");
  revalidatePath("/admin/datasets");
  revalidatePath("/admin/requests");
  uniqueIds.forEach((id) => {
    revalidatePath(`/browse/${id}`);
  });

  return { success: true, requested: uniqueIds.length, deleted: uniqueIds.length };
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

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "approve_request",
    targetType: "dataset_request",
    targetId: requestId,
    notes: notes ?? null,
  });
  if (activityResult) {
    return activityResult;
  }

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

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "reject_request",
    targetType: "dataset_request",
    targetId: requestId,
    notes,
  });
  if (activityResult) {
    return activityResult;
  }

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

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "approve_submission",
    targetType: "submission",
    targetId: submissionId,
    notes: notes ?? null,
  });
  if (activityResult) {
    return activityResult;
  }

  // Add funds to contributor's wallet
  const datasetRequest = Array.isArray(submission.dataset_requests)
    ? submission.dataset_requests[0]
    : submission.dataset_requests;

  if (datasetRequest?.reward_amount) {
    const adminClient = createAdminClient("admin_operations");

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
  revalidatePath("/contributor");
  revalidatePath("/contributor/contributions");

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

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "reject_submission",
    targetType: "submission",
    targetId: submissionId,
    notes,
  });
  if (activityResult) {
    return activityResult;
  }

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
  const totalVolumeCents = completed.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const platformCommissionCents = completed.reduce(
    (sum, t) => sum + Number(t.fee_amount || 0),
    0
  );
  const payouts = completed.filter((t) => t.type === "submission_payout");
  const payoutVolumeCents = payouts.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0
  );
  const pendingPayouts =
    transactions?.filter(
      (t) => t.type === "submission_payout" && t.status === "pending"
    ) ?? [];

  return {
    data: {
      totals: {
        // Canonical amounts are cents for consistency with ledger rows.
        total_volume_cents: totalVolumeCents,
        platform_commission_cents: platformCommissionCents,
        payout_volume_cents: payoutVolumeCents,
        // Backward-compatible aliases used by current UI.
        totalVolume: totalVolumeCents,
        platformCommission: platformCommissionCents,
        payoutVolume: payoutVolumeCents,
        totalTransactions: transactions?.length ?? 0,
        completedCount: completed.length,
        pendingPayouts: pendingPayouts.length,
      },
      transactions: transactions ?? [],
    },
  };
}

// Admin analytics snapshot
type FunnelEventName =
  | "funnel_visit"
  | "funnel_signup"
  | "funnel_dataset_created"
  | "funnel_fund";

const FUNNEL_EVENT_ORDER: FunnelEventName[] = [
  "funnel_visit",
  "funnel_signup",
  "funnel_dataset_created",
  "funnel_fund",
];

function toPercent(part: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Number(((part / total) * 100).toFixed(1));
}

function buildFunnelSummary(
  rows: Array<{
    event_name?: string | null;
    user_id?: string | null;
    session_id?: string | null;
  }>
) {
  const dedupeByEvent: Record<FunnelEventName, Set<string>> = {
    funnel_visit: new Set<string>(),
    funnel_signup: new Set<string>(),
    funnel_dataset_created: new Set<string>(),
    funnel_fund: new Set<string>(),
  };

  rows.forEach((row, idx) => {
    const eventName = row.event_name as FunnelEventName;
    if (!FUNNEL_EVENT_ORDER.includes(eventName)) {
      return;
    }

    const dedupeKey =
      row.user_id ?? row.session_id ?? `${eventName}:anonymous:${idx}`;

    dedupeByEvent[eventName].add(dedupeKey);
  });

  const counts = {
    visit: dedupeByEvent.funnel_visit.size,
    signup: dedupeByEvent.funnel_signup.size,
    datasetCreated: dedupeByEvent.funnel_dataset_created.size,
    fund: dedupeByEvent.funnel_fund.size,
  };

  return {
    windowDays: 30,
    steps: [
      { key: "visit", label: "Visit", count: counts.visit },
      { key: "signup", label: "Sign up", count: counts.signup },
      {
        key: "dataset_created",
        label: "Create dataset",
        count: counts.datasetCreated,
      },
      { key: "fund", label: "Fund dataset", count: counts.fund },
    ],
    counts,
    conversionRates: {
      visitToSignupPct: toPercent(counts.signup, counts.visit),
      signupToDatasetPct: toPercent(counts.datasetCreated, counts.signup),
      datasetToFundPct: toPercent(counts.fund, counts.datasetCreated),
      visitToFundPct: toPercent(counts.fund, counts.visit),
    },
  };
}

type DashboardTelemetryRow = {
  event_name?: string | null;
  user_role?: string | null;
  metadata?: Record<string, unknown> | null;
};

function buildDashboardTelemetrySummary(rows: DashboardTelemetryRow[]) {
  const visitsByRole: Record<string, number> = {};
  const actionsByRole: Record<string, number> = {};
  const ttaByRole: Record<string, number[]> = {};

  rows.forEach((row) => {
    const role = String(row.user_role ?? "unknown");
    if (row.event_name === "dashboard_view") {
      visitsByRole[role] = (visitsByRole[role] ?? 0) + 1;
      return;
    }

    if (row.event_name === "dashboard_action_clicked") {
      actionsByRole[role] = (actionsByRole[role] ?? 0) + 1;
      const tta = Number(
        (row.metadata && typeof row.metadata === "object"
          ? row.metadata.time_to_action_ms
          : 0) ?? 0
      );
      if (Number.isFinite(tta) && tta > 0) {
        const current = ttaByRole[role] ?? [];
        current.push(tta);
        ttaByRole[role] = current;
      }
    }
  });

  const avgTimeToActionMsByRole = Object.fromEntries(
    Object.entries(ttaByRole).map(([role, values]) => {
      if (values.length === 0) {
        return [role, 0];
      }
      const sum = values.reduce((acc, value) => acc + value, 0);
      return [role, Math.round(sum / values.length)];
    })
  );

  const actionToViewRatePctByRole = Object.fromEntries(
    Object.keys({ ...visitsByRole, ...actionsByRole }).map((role) => {
      const views = visitsByRole[role] ?? 0;
      const actions = actionsByRole[role] ?? 0;
      return [role, toPercent(actions, views)];
    })
  );

  return {
    windowDays: 30,
    visitsByRole,
    actionsByRole,
    avgTimeToActionMsByRole,
    actionToViewRatePctByRole,
  };
}

export async function getAdminAnalyticsSummary() {
  const supabase = await createClient();
  const admin = createAdminClient("admin_operations");
  const adminClient = admin as any;

  if (!(await isAdmin())) {
    return { error: "Admin access required" };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  const [usersRes, datasetsRes, submissionsRes, funnelRes, dashboardRes] = await Promise.all([
    supabase.from("profiles").select("role, created_at"),
    supabase
      .from("dataset_requests")
      .select("status, approval_status, created_at"),
    supabase.from("submissions").select("status, created_at"),
    adminClient
      .from("product_analytics_events")
      .select("event_name, user_id, session_id")
      .in("event_name", FUNNEL_EVENT_ORDER)
      .gte("occurred_at", thirtyDaysAgoIso),
    adminClient
      .from("product_analytics_events")
      .select("event_name,user_role,metadata")
      .in("event_name", ["dashboard_view", "dashboard_action_clicked"])
      .gte("occurred_at", thirtyDaysAgoIso),
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
  const funnelErrorCode = String(funnelRes?.error?.code ?? "");
  const funnelRows =
    funnelRes?.error && funnelErrorCode === "42P01"
      ? []
      : ((funnelRes?.data as Array<{
          event_name?: string | null;
          user_id?: string | null;
          session_id?: string | null;
        }>) ?? []);

  if (funnelRes?.error && funnelErrorCode !== "42P01") {
    console.error("Failed to load funnel analytics events", funnelRes.error);
  }

  const funnel = buildFunnelSummary(funnelRows);
  const dashboardErrorCode = String(dashboardRes?.error?.code ?? "");
  const dashboardRows =
    dashboardRes?.error && dashboardErrorCode === "42P01"
      ? []
      : ((dashboardRes?.data as DashboardTelemetryRow[]) ?? []);

  if (dashboardRes?.error && dashboardErrorCode !== "42P01") {
    console.error("Failed to load dashboard telemetry events", dashboardRes.error);
  }

  const dashboardTelemetry = buildDashboardTelemetrySummary(dashboardRows);

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
      funnel,
      dashboardTelemetry,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "update_user_role",
    targetType: "profile",
    targetId: userId,
    notes: `Role changed to "${role}".`,
  });
  if (activityResult) {
    return activityResult;
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

type AdminActivityLogEntry = {
  id: string;
  admin_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  notes: string | null;
  created_at: string;
  profiles?:
    | { full_name?: string | null; mail?: string | null }
    | { full_name?: string | null; mail?: string | null }[]
    | null;
};

type WaitlistEntry = {
  id: string;
  full_name: string | null;
  email: string;
  company: string | null;
  use_case: string | null;
  status: "pending" | "contacted" | "qualified" | "converted";
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportTicketPriority = "low" | "normal" | "high" | "urgent";

type AdminSupportTicketEntry = {
  id: string;
  user_id: string | null;
  subject: string;
  description: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  message_count: number;
  last_message_preview: string | null;
  requester: {
    id: string;
    full_name: string | null;
    mail: string | null;
  } | null;
  assignee: {
    id: string;
    full_name: string | null;
    mail: string | null;
  } | null;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getAdminActivityLog(filters: {
  actionType?: string | null;
  targetType?: string | null;
  adminId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  pageSize?: number;
  limit?: number;
}): Promise<
  | {
      data: AdminActivityLogEntry[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      filterOptions: {
        actions: string[];
        targets: string[];
        admins: Array<{ id: string; full_name: string | null; mail: string | null }>;
      };
    }
  | ActionError
> {
  const parsedInput = parseInput(
    adminActivityFiltersSchema,
    filters,
    "Invalid admin activity filters"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  if (
    validated.dateFrom &&
    validated.dateTo &&
    validated.dateFrom > validated.dateTo
  ) {
    return actionError("VALIDATION_ERROR", "dateFrom must be before dateTo");
  }

  const pageSize = Math.min(
    100,
    Math.max(1, validated.pageSize ?? validated.limit ?? 25)
  );
  const page = Math.max(1, validated.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("admin_activity_log")
    .select(
      `
      id,
      admin_id,
      action_type,
      target_type,
      target_id,
      notes,
      created_at,
      profiles:admin_id (
        full_name,
        mail
      )
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (validated.actionType) {
    query = query.eq("action_type", validated.actionType);
  }

  if (validated.targetType) {
    query = query.eq("target_type", validated.targetType);
  }

  if (validated.adminId) {
    query = query.eq("admin_id", validated.adminId);
  }

  if (validated.dateFrom) {
    query = query.gte("created_at", toDayStartIso(validated.dateFrom));
  }
  if (validated.dateTo) {
    query = query.lte("created_at", toDayEndIso(validated.dateTo));
  }

  const [activityRes, optionsRes, adminsRes] = await Promise.all([
    query,
    supabase
      .from("admin_activity_log")
      .select("action_type,target_type")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("profiles")
      .select("id,full_name,mail")
      .eq("role", "admin")
      .order("full_name", { ascending: true }),
  ]);

  const { data, error, count } = activityRes;

  if (error) {
    return actionError("DB_ERROR", error.message);
  }
  if (optionsRes.error) {
    return actionError("DB_ERROR", optionsRes.error.message);
  }
  if (adminsRes.error) {
    return actionError("DB_ERROR", adminsRes.error.message);
  }

  const actionSet = new Set<string>();
  const targetSet = new Set<string>();
  (optionsRes.data ?? []).forEach((entry) => {
    if (entry.action_type) actionSet.add(entry.action_type);
    if (entry.target_type) targetSet.add(entry.target_type);
  });

  const total = count ?? data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    data: (data ?? []) as AdminActivityLogEntry[],
    page,
    pageSize,
    total,
    totalPages,
    filterOptions: {
      actions: Array.from(actionSet).sort((a, b) => a.localeCompare(b)),
      targets: Array.from(targetSet).sort((a, b) => a.localeCompare(b)),
      admins: (adminsRes.data ?? []).map((admin) => ({
        id: admin.id,
        full_name: admin.full_name ?? null,
        mail: admin.mail ?? null,
      })),
    },
  };
}

export async function getWaitlistEntries(filters: {
  status?: "pending" | "contacted" | "qualified" | "converted" | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
} = {}): Promise<
  | {
      data: WaitlistEntry[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }
  | ActionError
> {
  const parsedInput = parseInput(
    adminWaitlistListSchema,
    filters,
    "Invalid waitlist filters"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const pageSize = Math.min(100, Math.max(1, validated.pageSize ?? 25));
  const page = Math.max(1, validated.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const adminClient = createAdminClient("admin_operations") as any;
  let query = adminClient
    .from("waitlist_signups")
    .select(
      "id,full_name,email,company,use_case,status,metadata,created_at,updated_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (validated.status) {
    query = query.eq("status", validated.status);
  }

  const search = validated.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `email.ilike.${pattern},full_name.ilike.${pattern},company.ilike.${pattern},use_case.ilike.${pattern}`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  const total = count ?? data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    data: (data ?? []).map((entry: any) => ({
      ...entry,
      metadata: isObjectRecord(entry.metadata) ? entry.metadata : {},
    })) as WaitlistEntry[],
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function updateWaitlistStatus(
  id: string,
  status: "pending" | "contacted" | "qualified" | "converted",
  notes?: string
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    adminWaitlistStatusUpdateSchema,
    { id, status, notes },
    "Invalid waitlist status payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const supabase = await createClient();

  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminClient = createAdminClient("admin_operations") as any;

  const { data: currentEntry, error: fetchError } = await adminClient
    .from("waitlist_signups")
    .select("id,status,metadata")
    .eq("id", validated.id)
    .maybeSingle();

  if (fetchError || !currentEntry) {
    return actionError(
      fetchError ? "DB_ERROR" : "NOT_FOUND",
      fetchError?.message ?? "Waitlist entry not found"
    );
  }

  const metadata = isObjectRecord(currentEntry.metadata)
    ? { ...currentEntry.metadata }
    : {};
  const trimmedNotes = validated.notes?.trim() ?? "";

  if (trimmedNotes) {
    metadata.notes = trimmedNotes;
  } else {
    delete metadata.notes;
  }
  metadata.status_updated_at = new Date().toISOString();
  metadata.previous_status = currentEntry.status;

  const { error: updateError } = await adminClient
    .from("waitlist_signups")
    .update({
      status,
      metadata,
    })
    .eq("id", validated.id);

  if (updateError) {
    return actionError("DB_ERROR", updateError.message);
  }

  const activityNotes = trimmedNotes
    ? `Waitlist status changed from "${currentEntry.status}" to "${status}". Notes: ${trimmedNotes}`
    : `Waitlist status changed from "${currentEntry.status}" to "${status}".`;

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "update_waitlist_status",
    targetType: "waitlist_signup",
    targetId: validated.id,
    notes: activityNotes,
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/admin/support");
  return { ok: true };
}

export async function getAdminSupportTickets(filters: {
  status?: SupportTicketStatus | null;
  priority?: SupportTicketPriority | null;
  assignedTo?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
} = {}): Promise<
  | {
      data: AdminSupportTicketEntry[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      assignees: Array<{ id: string; full_name: string | null; mail: string | null }>;
    }
  | ActionError
> {
  const parsedInput = parseInput(
    adminSupportTicketListSchema,
    filters,
    "Invalid support ticket filters"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const pageSize = Math.min(100, Math.max(1, validated.pageSize ?? 25));
  const page = Math.max(1, validated.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const adminClient = createAdminClient("admin_operations") as any;
  let query = adminClient
    .from("support_tickets")
    .select(
      `
      id,
      user_id,
      subject,
      description,
      status,
      priority,
      assigned_to,
      created_at,
      updated_at,
      resolved_at,
      messages,
      requester:profiles!support_tickets_user_id_fkey (
        id,
        full_name,
        mail
      ),
      assignee:profiles!support_tickets_assigned_to_fkey (
        id,
        full_name,
        mail
      )
    `,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (validated.status) {
    query = query.eq("status", validated.status);
  }
  if (validated.priority) {
    query = query.eq("priority", validated.priority);
  }
  if (validated.assignedTo) {
    query = query.eq("assigned_to", validated.assignedTo);
  }
  if (validated.search?.trim()) {
    const pattern = `%${validated.search.trim()}%`;
    query = query.or(`subject.ilike.${pattern},description.ilike.${pattern}`);
  }

  const [ticketsRes, assigneesRes] = await Promise.all([
    query,
    adminClient
      .from("profiles")
      .select("id,full_name,mail")
      .eq("role", "admin")
      .order("full_name", { ascending: true }),
  ]);

  if (ticketsRes.error) {
    return actionError("DB_ERROR", ticketsRes.error.message);
  }
  if (assigneesRes.error) {
    return actionError("DB_ERROR", assigneesRes.error.message);
  }

  const rows = (ticketsRes.data ?? []) as Array<{
    id: string;
    user_id: string | null;
    subject: string;
    description: string | null;
    status: SupportTicketStatus;
    priority: SupportTicketPriority;
    assigned_to: string | null;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    messages: unknown;
    requester:
      | { id: string; full_name: string | null; mail: string | null }
      | Array<{ id: string; full_name: string | null; mail: string | null }>
      | null;
    assignee:
      | { id: string; full_name: string | null; mail: string | null }
      | Array<{ id: string; full_name: string | null; mail: string | null }>
      | null;
  }>;

  const data: AdminSupportTicketEntry[] = rows.map((ticket) => {
    const requester = Array.isArray(ticket.requester)
      ? ticket.requester[0]
      : ticket.requester;
    const assignee = Array.isArray(ticket.assignee)
      ? ticket.assignee[0]
      : ticket.assignee;
    const messages = parseSupportMessages(ticket.messages);

    return {
      id: ticket.id,
      user_id: ticket.user_id,
      subject: ticket.subject,
      description: ticket.description ?? null,
      status: ticket.status,
      priority: ticket.priority ?? "normal",
      assigned_to: ticket.assigned_to,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      resolved_at: ticket.resolved_at ?? null,
      message_count: messages.length,
      last_message_preview: messages.at(-1)?.body.slice(0, 140) ?? null,
      requester: requester
        ? {
            id: requester.id,
            full_name: requester.full_name ?? null,
            mail: requester.mail ?? null,
          }
        : null,
      assignee: assignee
        ? {
            id: assignee.id,
            full_name: assignee.full_name ?? null,
            mail: assignee.mail ?? null,
          }
        : null,
    };
  });

  const total = ticketsRes.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    data,
    page,
    pageSize,
    total,
    totalPages,
    assignees: (assigneesRes.data ?? []).map((admin: any) => ({
      id: admin.id,
      full_name: admin.full_name ?? null,
      mail: admin.mail ?? null,
    })),
  };
}

export async function updateAdminSupportTicket(
  input: Record<string, unknown>
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    adminSupportTicketUpdateSchema,
    input,
    "Invalid support ticket update payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const supabase = await createClient();
  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminClient = createAdminClient("admin_operations") as any;
  const { data: ticket, error: ticketError } = await adminClient
    .from("support_tickets")
    .select("id,status,priority,assigned_to,resolved_at,messages")
    .eq("id", validated.ticketId)
    .maybeSingle();

  if (ticketError || !ticket) {
    return actionError(
      ticketError ? "DB_ERROR" : "NOT_FOUND",
      ticketError?.message ?? "Support ticket not found"
    );
  }

  const now = new Date().toISOString();
  const messages = parseSupportMessages(ticket.messages);
  const reply = validated.reply?.trim();
  if (reply) {
    messages.push({
      id: randomUUID(),
      role: "admin",
      body: reply,
      created_at: now,
    });
  }

  const resolvedAt =
    validated.status === "resolved" || validated.status === "closed"
      ? ticket.resolved_at ?? now
      : null;
  const priority = validated.priority ?? ticket.priority ?? "normal";
  const assignedTo =
    validated.assignedTo === undefined ? ticket.assigned_to : validated.assignedTo;

  const { error: updateError } = await adminClient
    .from("support_tickets")
    .update({
      status: validated.status,
      priority,
      assigned_to: assignedTo,
      resolved_at: resolvedAt,
      messages,
      updated_at: now,
    })
    .eq("id", validated.ticketId);

  if (updateError) {
    return actionError("DB_ERROR", updateError.message);
  }

  const notes = [
    `Status: ${ticket.status} -> ${validated.status}`,
    `Priority: ${(ticket.priority ?? "normal") as string} -> ${priority}`,
    `Assigned to: ${ticket.assigned_to ?? "unassigned"} -> ${assignedTo ?? "unassigned"}`,
    reply ? "Admin reply added." : "No new reply.",
  ].join(" | ");

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "triage_support_ticket",
    targetType: "support_ticket",
    targetId: validated.ticketId,
    notes,
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/admin/support");
  revalidatePath(`/requester/support/${validated.ticketId}`);
  return { ok: true };
}

export async function getAdminPayoutQueues(limit = 300): Promise<
  | {
      pending: Array<{
        id: string;
        status: "pending";
        amount: number;
        currency: string;
        created_at: string;
        updated_at: string;
        reference_id: string | null;
        submission_id: string | null;
        dataset_request_id: string | null;
        contributor_name: string | null;
        contributor_email: string | null;
        dataset_title: string | null;
        submission_status: string | null;
        failure_reason: string | null;
        age_hours: number;
      }>;
      failed: Array<{
        id: string;
        status: "failed";
        amount: number;
        currency: string;
        created_at: string;
        updated_at: string;
        reference_id: string | null;
        submission_id: string | null;
        dataset_request_id: string | null;
        contributor_name: string | null;
        contributor_email: string | null;
        dataset_title: string | null;
        submission_status: string | null;
        failure_reason: string | null;
        age_hours: number;
      }>;
      totals: {
        pendingCount: number;
        failedCount: number;
        stalePendingCount: number;
      };
    }
  | ActionError
> {
  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const maxLimit = Math.min(Math.max(1, limit), 1000);
  const adminClient = createAdminClient("admin_operations") as any;
  const { data: txRows, error: txError } = await adminClient
    .from("transactions")
    .select(
      "id,user_id,amount,currency,status,reference_id,dataset_request_id,submission_id,metadata,created_at,updated_at"
    )
    .eq("type", "submission_payout")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(maxLimit);

  if (txError) {
    return actionError("DB_ERROR", txError.message);
  }

  const rows = (txRows ?? []) as Array<{
    id: string;
    user_id: string;
    amount: number;
    currency: string | null;
    status: "pending" | "failed";
    reference_id: string | null;
    dataset_request_id: string | null;
    submission_id: string | null;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  }>;

  const userIds = Array.from(new Set(rows.map((row) => row.user_id))).filter(
    Boolean
  );
  const datasetIds = Array.from(
    new Set(rows.map((row) => row.dataset_request_id).filter(Boolean))
  ) as string[];
  const submissionIds = Array.from(
    new Set(rows.map((row) => row.submission_id).filter(Boolean))
  ) as string[];

  const [profilesRes, datasetsRes, submissionsRes] = await Promise.all([
    userIds.length > 0
      ? adminClient
          .from("profiles")
          .select("id,full_name,mail")
          .in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    datasetIds.length > 0
      ? adminClient.from("dataset_requests").select("id,title").in("id", datasetIds)
      : Promise.resolve({ data: [], error: null }),
    submissionIds.length > 0
      ? adminClient
          .from("submissions")
          .select("id,status")
          .in("id", submissionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesRes.error || datasetsRes.error || submissionsRes.error) {
    const err =
      profilesRes.error?.message ??
      datasetsRes.error?.message ??
      submissionsRes.error?.message ??
      "Failed to load payout queue metadata";
    return actionError("DB_ERROR", err);
  }

  const profileMap = new Map<
    string,
    { id: string; full_name: string | null; mail: string | null }
  >(
    (profilesRes.data ?? []).map((profile: any) => [
      profile.id,
      {
        id: profile.id,
        full_name: profile.full_name ?? null,
        mail: profile.mail ?? null,
      },
    ])
  );
  const datasetMap = new Map<
    string,
    { id: string; title: string | null }
  >(
    (datasetsRes.data ?? []).map((dataset: any) => [
      dataset.id,
      {
        id: dataset.id,
        title: dataset.title ?? null,
      },
    ])
  );
  const submissionMap = new Map<
    string,
    { id: string; status: string | null }
  >(
    (submissionsRes.data ?? []).map((submission: any) => [
      submission.id,
      {
        id: submission.id,
        status: submission.status ?? null,
      },
    ])
  );

  const mapped = rows.map((row) => {
    const profile = profileMap.get(row.user_id);
    const dataset = row.dataset_request_id
      ? datasetMap.get(row.dataset_request_id)
      : null;
    const submission = row.submission_id
      ? submissionMap.get(row.submission_id)
      : null;
    const metadata = isObjectRecord(row.metadata) ? row.metadata : {};
    const failureReason = (() => {
      const message = metadata.error_message ?? metadata.error ?? metadata.reason;
      return typeof message === "string" ? message : null;
    })();
    const ageHours = Math.max(
      0,
      Math.round((Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60))
    );

    return {
      id: row.id,
      status: row.status,
      amount: Number(row.amount ?? 0),
      currency: (row.currency ?? "USD").toUpperCase(),
      created_at: row.created_at,
      updated_at: row.updated_at,
      reference_id: row.reference_id,
      submission_id: row.submission_id,
      dataset_request_id: row.dataset_request_id,
      contributor_name: profile?.full_name ?? null,
      contributor_email: profile?.mail ?? null,
      dataset_title: dataset?.title ?? null,
      submission_status: submission?.status ?? null,
      failure_reason: failureReason,
      age_hours: ageHours,
    };
  });

  const pending = mapped.filter(
    (row): row is (typeof mapped)[number] & { status: "pending" } =>
      row.status === "pending"
  );
  const failed = mapped.filter(
    (row): row is (typeof mapped)[number] & { status: "failed" } =>
      row.status === "failed"
  );

  const stalePendingCount = pending.filter((row) => row.age_hours >= 24).length;

  return {
    pending,
    failed,
    totals: {
      pendingCount: pending.length,
      failedCount: failed.length,
      stalePendingCount,
    },
  };
}

export async function reconcilePayoutTransaction(
  transactionId: string,
  nextStatus: "pending" | "cancelled",
  note?: string
): Promise<{ ok: true } | ActionError> {
  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  if (!transactionId) {
    return actionError("VALIDATION_ERROR", "Transaction id is required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminClient = createAdminClient("admin_operations") as any;

  const { data: tx, error: txError } = await adminClient
    .from("transactions")
    .select("id,type,status,metadata")
    .eq("id", transactionId)
    .maybeSingle();

  if (txError || !tx) {
    return actionError(
      txError ? "DB_ERROR" : "NOT_FOUND",
      txError?.message ?? "Transaction not found"
    );
  }
  if (tx.type !== "submission_payout") {
    return actionError("VALIDATION_ERROR", "Only submission payouts can be reconciled");
  }

  const metadata = isObjectRecord(tx.metadata) ? { ...tx.metadata } : {};
  metadata.reconciled_at = new Date().toISOString();
  metadata.reconciled_by = user?.id ?? null;
  metadata.reconcile_note = note?.trim() || null;
  metadata.previous_status = tx.status;

  const { error: updateError } = await adminClient
    .from("transactions")
    .update({
      status: nextStatus,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId);

  if (updateError) {
    return actionError("DB_ERROR", updateError.message);
  }

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "reconcile_payout_transaction",
    targetType: "transaction",
    targetId: transactionId,
    notes: `Payout status changed from "${tx.status}" to "${nextStatus}". ${note?.trim() ? `Note: ${note.trim()}` : ""}`.trim(),
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/admin/payments");
  return { ok: true };
}
