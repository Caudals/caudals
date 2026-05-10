"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getDatasetBudgetSummary } from "@/lib/actions/payment-actions";
import { runPaymentLedgerConsistencyCheck } from "@/lib/jobs/payment-ledger-consistency";
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

function isMissingPlatformSettingsTableError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;

  if (error.code === "PGRST205" || error.code === "42P01") {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("platform_settings") &&
    (message.includes("could not find the table") ||
      message.includes("does not exist"))
  );
}

export type AdminOperationalHealthSignalStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "unknown";

export type AdminOperationalHealthSignal = {
  id: "analytics_surface" | "ledger_consistency";
  label: string;
  status: AdminOperationalHealthSignalStatus;
  summary: string;
  detail: string;
  href: string;
};

export type AdminOperationalHealthSnapshot = {
  checked_at: string;
  overall_status: AdminOperationalHealthSignalStatus;
  signals: AdminOperationalHealthSignal[];
};

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
    if (isMissingPlatformSettingsTableError(error)) {
      console.warn(
        "platform_settings table missing; returning empty admin settings payload",
      );
      return { data: {} as PlatformSettings };
    }

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
    if (isMissingPlatformSettingsTableError(error)) {
      return {
        error:
          "Platform settings storage is unavailable. Apply migration 019_platform_settings.sql and retry.",
      };
    }

    console.error("Error upserting platform setting:", error);
    return { error: error.message };
  }

  revalidatePath("/admin");
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

function getHealthSeverityWeight(status: AdminOperationalHealthSignalStatus) {
  switch (status) {
    case "critical":
      return 0;
    case "warning":
      return 1;
    case "unknown":
      return 2;
    case "healthy":
    default:
      return 3;
  }
}

function getMostSevereHealthStatus(
  statuses: AdminOperationalHealthSignalStatus[]
): AdminOperationalHealthSignalStatus {
  if (statuses.length === 0) {
    return "unknown";
  }

  return statuses.reduce((worst, current) =>
    getHealthSeverityWeight(current) < getHealthSeverityWeight(worst)
      ? current
      : worst
  );
}

export async function getAdminOperationalHealthStatus(): Promise<
  | {
      data: AdminOperationalHealthSnapshot;
    }
  | ActionError
> {
  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const checkedAt = new Date().toISOString();
  const analyticsAdmin = createAdminClient("analytics_ingest");
  const analyticsClient = analyticsAdmin as any;

  const [analyticsProbe, ledgerProbe] = await Promise.allSettled([
    analyticsClient.from("product_analytics_events").select("id").limit(1),
    runPaymentLedgerConsistencyCheck(),
  ]);

  const signals: AdminOperationalHealthSignal[] = [];

  if (analyticsProbe.status === "fulfilled") {
    const analyticsError = analyticsProbe.value.error;

    if (!analyticsError) {
      signals.push({
        id: "analytics_surface",
        label: "Analytics ingestion",
        status: "healthy",
        summary: "Product analytics surface is available.",
        detail: "Events can be written and queried from product_analytics_events.",
        href: "/admin?module=pipeline",
      });
    } else if (isMissingTableError(analyticsError, "product_analytics_events")) {
      signals.push({
        id: "analytics_surface",
        label: "Analytics ingestion",
        status: "warning",
        summary: "Analytics table is missing in this environment.",
        detail:
          "Ingestion is fail-open, but funnel and dashboard telemetry are degraded until migration 024 is applied.",
        href: "/admin?module=pipeline",
      });
    } else {
      signals.push({
        id: "analytics_surface",
        label: "Analytics ingestion",
        status: "critical",
        summary: "Analytics probe returned an unexpected error.",
        detail: analyticsError.message || "Unknown analytics probe failure.",
        href: "/admin?module=pipeline",
      });
    }
  } else {
    signals.push({
      id: "analytics_surface",
      label: "Analytics ingestion",
      status: "unknown",
      summary: "Analytics probe could not be completed.",
      detail:
        analyticsProbe.reason instanceof Error
          ? analyticsProbe.reason.message
          : "Unknown analytics probe failure.",
      href: "/admin?module=pipeline",
    });
  }

  if (ledgerProbe.status === "fulfilled") {
    const report = ledgerProbe.value;
    const highSeverityCount = report.totals.highSeverityCount;
    const issueCount = report.totals.issueCount;

    if (highSeverityCount > 0) {
      signals.push({
        id: "ledger_consistency",
        label: "Ledger consistency",
        status: "critical",
        summary: `${highSeverityCount} high-severity ledger drift issue(s) detected.`,
        detail: `${issueCount} total issue(s) across wallets, dataset funding, and payout transactions.`,
        href: "/admin?module=commercials",
      });
    } else if (issueCount > 0) {
      signals.push({
        id: "ledger_consistency",
        label: "Ledger consistency",
        status: "warning",
        summary: `${issueCount} non-critical ledger drift issue(s) detected.`,
        detail:
          "Run payments consistency repair for missing wallets or balance/data alignment before payout volume increases.",
        href: "/admin?module=commercials",
      });
    } else {
      signals.push({
        id: "ledger_consistency",
        label: "Ledger consistency",
        status: "healthy",
        summary: "No ledger drift detected.",
        detail: `${report.totals.transactionsChecked} transaction rows scanned.`,
        href: "/admin?module=commercials",
      });
    }
  } else {
    signals.push({
      id: "ledger_consistency",
      label: "Ledger consistency",
      status: "unknown",
      summary: "Ledger consistency check could not be completed.",
      detail:
        ledgerProbe.reason instanceof Error
          ? ledgerProbe.reason.message
          : "Unknown ledger check failure.",
      href: "/admin?module=commercials",
    });
  }

  return {
    data: {
      checked_at: checkedAt,
      overall_status: getMostSevereHealthStatus(
        signals.map((signal) => signal.status)
      ),
      signals,
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

  revalidatePath("/admin");

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

function isMissingTableError(error: unknown, tableName: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error ? String(error.message ?? "") : "";
  const normalized = message.toLowerCase();
  const table = tableName.toLowerCase();

  return (
    normalized.includes(`could not find the table 'public.${table}'`) ||
    normalized.includes(`relation "public.${table}" does not exist`)
  );
}

function extractStripeObjectIdFromEventPayload(payload: unknown): string | null {
  if (!isObjectRecord(payload)) {
    return null;
  }

  const data = payload.data;
  if (!isObjectRecord(data)) {
    return null;
  }

  const object = data.object;
  if (!isObjectRecord(object)) {
    return null;
  }

  const id = object.id;
  return typeof id === "string" ? id : null;
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

  revalidatePath("/admin");
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

  revalidatePath("/admin");
  revalidatePath(`/requester/support/${validated.ticketId}`);
  return { ok: true };
}

type AdminPayoutQueueRow = {
  id: string;
  contributor_id: string;
  status: "pending" | "failed";
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
  failure_count_for_contributor: number;
  is_repeated_failure: boolean;
};

type AdminPendingPayoutQueueRow = AdminPayoutQueueRow & { status: "pending" };
type AdminFailedPayoutQueueRow = AdminPayoutQueueRow & { status: "failed" };

type AdminPaymentAnomalySeverity = "high" | "medium" | "low";
type AdminPaymentAnomalyCategory =
  | "stale_pending_payout"
  | "failed_payout"
  | "repeated_payout_failure"
  | "missing_transfer_reference"
  | "duplicate_transfer_reference"
  | "webhook_processing_failed"
  | "webhook_processing_stuck"
  | "orphan_transfer_event"
  | "missing_webhook_ledger";

export type AdminPaymentAnomalyRow = {
  id: string;
  severity: AdminPaymentAnomalySeverity;
  category: AdminPaymentAnomalyCategory;
  title: string;
  description: string;
  created_at: string;
  transaction_id: string | null;
  stripe_event_id: string | null;
  reference_id: string | null;
  contributor_name: string | null;
  contributor_email: string | null;
  dataset_title: string | null;
  dataset_request_id: string | null;
  quick_link: string;
};

export type AdminPaymentComplianceRecord = {
  id: string;
  transaction_id: string;
  transaction_type: string | null;
  transaction_status: string | null;
  transaction_amount: number | null;
  transaction_currency: string | null;
  transaction_reference_id: string | null;
  dataset_request_id: string | null;
  dataset_title: string | null;
  contributor_id: string | null;
  contributor_name: string | null;
  contributor_email: string | null;
  legal_entity_name: string | null;
  legal_entity_country: string | null;
  tax_reference: string | null;
  vat_reference: string | null;
  invoice_reference: string | null;
  purchase_order_reference: string | null;
  payout_statement_reference: string | null;
  legal_hold: boolean;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type AdminPaymentComplianceUpsertInput = {
  transactionId: string;
  legalEntityName?: string | null;
  legalEntityCountry?: string | null;
  taxReference?: string | null;
  vatReference?: string | null;
  invoiceReference?: string | null;
  purchaseOrderReference?: string | null;
  payoutStatementReference?: string | null;
  legalHold?: boolean;
  notes?: string | null;
};

function normalizeComplianceText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function getAdminPayoutQueues(limit = 300): Promise<
  | {
      pending: AdminPendingPayoutQueueRow[];
      failed: AdminFailedPayoutQueueRow[];
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
      contributor_id: row.user_id,
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

  const failureCountByContributor = mapped.reduce((acc, row) => {
    if (row.status === "failed") {
      const current = acc.get(row.contributor_id) ?? 0;
      acc.set(row.contributor_id, current + 1);
    }
    return acc;
  }, new Map<string, number>());

  const enriched: AdminPayoutQueueRow[] = mapped.map((row) => {
    const failureCount = failureCountByContributor.get(row.contributor_id) ?? 0;
    return {
      ...row,
      failure_count_for_contributor: failureCount,
      is_repeated_failure: failureCount >= 2,
    };
  });

  const pending = enriched.filter(
    (row): row is AdminPendingPayoutQueueRow => row.status === "pending"
  );
  const failed = enriched.filter(
    (row): row is AdminFailedPayoutQueueRow => row.status === "failed"
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

export async function getAdminPaymentAnomalies(limit = 150): Promise<
  | {
      rows: AdminPaymentAnomalyRow[];
      totals: {
        total: number;
        high: number;
        medium: number;
        low: number;
        payout: number;
        transfer: number;
        webhook: number;
      };
      webhookLedgerAvailable: boolean;
    }
  | ActionError
> {
  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const adminClient = createAdminClient("admin_operations") as any;
  const maxLimit = Math.min(Math.max(25, limit), 1000);

  const { data: txRows, error: txError } = await adminClient
    .from("transactions")
    .select(
      "id,user_id,amount,currency,status,reference_id,dataset_request_id,submission_id,metadata,created_at,updated_at"
    )
    .eq("type", "submission_payout")
    .in("status", ["pending", "failed", "completed"])
    .order("created_at", { ascending: false })
    .limit(maxLimit);

  if (txError) {
    return actionError("DB_ERROR", txError.message);
  }

  const payoutRows = (txRows ?? []) as Array<{
    id: string;
    user_id: string;
    amount: number;
    currency: string | null;
    status: "pending" | "failed" | "completed";
    reference_id: string | null;
    dataset_request_id: string | null;
    submission_id: string | null;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  }>;

  const userIds = Array.from(new Set(payoutRows.map((row) => row.user_id))).filter(
    Boolean
  );
  const datasetIds = Array.from(
    new Set(payoutRows.map((row) => row.dataset_request_id).filter(Boolean))
  ) as string[];

  const [profilesRes, datasetsRes] = await Promise.all([
    userIds.length > 0
      ? adminClient
          .from("profiles")
          .select("id,full_name,mail")
          .in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    datasetIds.length > 0
      ? adminClient.from("dataset_requests").select("id,title").in("id", datasetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesRes.error || datasetsRes.error) {
    return actionError(
      "DB_ERROR",
      profilesRes.error?.message ??
        datasetsRes.error?.message ??
        "Failed to load anomaly metadata"
    );
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
  const datasetMap = new Map<string, { id: string; title: string | null }>(
    (datasetsRes.data ?? []).map((dataset: any) => [
      dataset.id,
      {
        id: dataset.id,
        title: dataset.title ?? null,
      },
    ])
  );

  const payoutFailuresByContributor = payoutRows.reduce((acc, row) => {
    if (row.status === "failed") {
      const current = acc.get(row.user_id) ?? 0;
      acc.set(row.user_id, current + 1);
    }
    return acc;
  }, new Map<string, number>());

  const completedTransferRefs = payoutRows
    .filter((row) => row.status === "completed" && row.reference_id)
    .map((row) => String(row.reference_id));
  const transferRefCounts = completedTransferRefs.reduce((acc, ref) => {
    acc.set(ref, (acc.get(ref) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  const anomalies: AdminPaymentAnomalyRow[] = [];
  const nowMs = Date.now();

  for (const row of payoutRows) {
    const profile = profileMap.get(row.user_id);
    const dataset = row.dataset_request_id
      ? datasetMap.get(row.dataset_request_id)
      : null;
    const metadata = isObjectRecord(row.metadata) ? row.metadata : {};
    const failureReason = (() => {
      const message = metadata.error_message ?? metadata.error ?? metadata.reason;
      return typeof message === "string" ? message : null;
    })();
    const ageHours = Math.max(
      0,
      Math.round((nowMs - new Date(row.created_at).getTime()) / (1000 * 60 * 60))
    );

    if (row.status === "pending" && ageHours >= 24) {
      anomalies.push({
        id: `stale_pending_${row.id}`,
        severity: ageHours >= 72 ? "high" : "medium",
        category: "stale_pending_payout",
        title: "Stale pending payout",
        description: `Payout has remained pending for ${ageHours}h.`,
        created_at: row.updated_at,
        transaction_id: row.id,
        stripe_event_id: null,
        reference_id: row.reference_id,
        contributor_name: profile?.full_name ?? null,
        contributor_email: profile?.mail ?? null,
        dataset_title: dataset?.title ?? null,
        dataset_request_id: row.dataset_request_id,
        quick_link: "/admin?module=commercials&pending=stale&anomaly=payout",
      });
    }

    if (row.status === "failed") {
      anomalies.push({
        id: `failed_payout_${row.id}`,
        severity: "medium",
        category: "failed_payout",
        title: "Failed payout",
        description: failureReason ?? "Payout failed without explicit failure metadata.",
        created_at: row.updated_at,
        transaction_id: row.id,
        stripe_event_id: null,
        reference_id: row.reference_id,
        contributor_name: profile?.full_name ?? null,
        contributor_email: profile?.mail ?? null,
        dataset_title: dataset?.title ?? null,
        dataset_request_id: row.dataset_request_id,
        quick_link: "/admin?module=commercials&failed=all&anomaly=payout",
      });

      const failureCount = payoutFailuresByContributor.get(row.user_id) ?? 0;
      if (failureCount >= 2) {
        anomalies.push({
          id: `repeated_failure_${row.id}`,
          severity: "high",
          category: "repeated_payout_failure",
          title: "Repeated payout failures",
          description: `Contributor has ${failureCount} failed payouts in the current queue.`,
          created_at: row.updated_at,
          transaction_id: row.id,
          stripe_event_id: null,
          reference_id: row.reference_id,
          contributor_name: profile?.full_name ?? null,
          contributor_email: profile?.mail ?? null,
          dataset_title: dataset?.title ?? null,
          dataset_request_id: row.dataset_request_id,
          quick_link: "/admin?module=commercials&failed=repeated&anomaly=payout",
        });
      }
    }

    if (row.status === "completed" && !row.reference_id) {
      anomalies.push({
        id: `missing_transfer_reference_${row.id}`,
        severity: "high",
        category: "missing_transfer_reference",
        title: "Completed payout missing transfer reference",
        description:
          "Completed submission payout has no Stripe transfer reference_id for reconciliation.",
        created_at: row.updated_at,
        transaction_id: row.id,
        stripe_event_id: null,
        reference_id: null,
        contributor_name: profile?.full_name ?? null,
        contributor_email: profile?.mail ?? null,
        dataset_title: dataset?.title ?? null,
        dataset_request_id: row.dataset_request_id,
        quick_link: "/admin?module=commercials&anomaly=transfer",
      });
    }

    if (
      row.status === "completed" &&
      row.reference_id &&
      (transferRefCounts.get(String(row.reference_id)) ?? 0) > 1
    ) {
      anomalies.push({
        id: `duplicate_transfer_reference_${row.id}`,
        severity: "high",
        category: "duplicate_transfer_reference",
        title: "Duplicate transfer reference",
        description: `Transfer reference ${row.reference_id} appears on multiple payout transactions.`,
        created_at: row.updated_at,
        transaction_id: row.id,
        stripe_event_id: null,
        reference_id: row.reference_id,
        contributor_name: profile?.full_name ?? null,
        contributor_email: profile?.mail ?? null,
        dataset_title: dataset?.title ?? null,
        dataset_request_id: row.dataset_request_id,
        quick_link: "/admin?module=commercials&anomaly=transfer",
      });
    }
  }

  let webhookLedgerAvailable = true;
  const { data: webhookRows, error: webhookError } = await adminClient
    .from("stripe_webhook_events")
    .select(
      "stripe_event_id,event_type,processing_state,last_error,received_at,processed_at,payload"
    )
    .order("received_at", { ascending: false })
    .limit(maxLimit);

  const payoutTransferRefSet = new Set(
    payoutRows
      .map((row) => row.reference_id)
      .filter((value): value is string => typeof value === "string")
  );

  if (webhookError) {
    if (isMissingTableError(webhookError, "stripe_webhook_events")) {
      webhookLedgerAvailable = false;
      anomalies.push({
        id: "missing_webhook_ledger",
        severity: "medium",
        category: "missing_webhook_ledger",
        title: "Webhook replay ledger unavailable",
        description:
          "Table public.stripe_webhook_events is missing. Event replay correlation is operating in fallback mode.",
        created_at: new Date().toISOString(),
        transaction_id: null,
        stripe_event_id: null,
        reference_id: null,
        contributor_name: null,
        contributor_email: null,
        dataset_title: null,
        dataset_request_id: null,
        quick_link: "/admin?module=commercials&anomaly=webhook",
      });
    } else {
      return actionError("DB_ERROR", webhookError.message);
    }
  } else {
    const events = (webhookRows ?? []) as Array<{
      stripe_event_id: string;
      event_type: string;
      processing_state: string | null;
      last_error: string | null;
      received_at: string;
      processed_at: string | null;
      payload: unknown;
    }>;

    for (const event of events) {
      const state = String(event.processing_state ?? "").toLowerCase();

      if (state === "failed") {
        anomalies.push({
          id: `webhook_failed_${event.stripe_event_id}`,
          severity: "high",
          category: "webhook_processing_failed",
          title: "Webhook processing failed",
          description:
            event.last_error ??
            `Stripe webhook ${event.event_type} failed during processing.`,
          created_at: event.received_at,
          transaction_id: null,
          stripe_event_id: event.stripe_event_id,
          reference_id: null,
          contributor_name: null,
          contributor_email: null,
          dataset_title: null,
          dataset_request_id: null,
          quick_link: "/admin?module=commercials&anomaly=webhook",
        });
      }

      if (state === "processing") {
        const ageMinutes = Math.max(
          0,
          Math.round(
            (nowMs - new Date(event.received_at).getTime()) / (1000 * 60)
          )
        );
        if (ageMinutes >= 15) {
          anomalies.push({
            id: `webhook_stuck_${event.stripe_event_id}`,
            severity: ageMinutes >= 60 ? "high" : "medium",
            category: "webhook_processing_stuck",
            title: "Webhook processing appears stuck",
            description: `Event ${event.event_type} has been in processing state for ${ageMinutes} minutes.`,
            created_at: event.received_at,
            transaction_id: null,
            stripe_event_id: event.stripe_event_id,
            reference_id: null,
            contributor_name: null,
            contributor_email: null,
            dataset_title: null,
            dataset_request_id: null,
            quick_link: "/admin?module=commercials&anomaly=webhook",
          });
        }
      }

      if (
        event.event_type === "transfer.created" ||
        event.event_type === "transfer.failed"
      ) {
        const transferId = extractStripeObjectIdFromEventPayload(event.payload);
        if (transferId && !payoutTransferRefSet.has(transferId)) {
          anomalies.push({
            id: `orphan_transfer_event_${event.stripe_event_id}`,
            severity: "medium",
            category: "orphan_transfer_event",
            title: "Transfer event missing ledger transaction",
            description: `Webhook ${event.event_type} references transfer ${transferId} with no matching payout transaction reference.`,
            created_at: event.received_at,
            transaction_id: null,
            stripe_event_id: event.stripe_event_id,
            reference_id: transferId,
            contributor_name: null,
            contributor_email: null,
            dataset_title: null,
            dataset_request_id: null,
            quick_link: "/admin?module=commercials&anomaly=transfer",
          });
        }
      }
    }
  }

  const severityWeight: Record<AdminPaymentAnomalySeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  const sorted = anomalies.sort(
    (a, b) =>
      severityWeight[a.severity] - severityWeight[b.severity] ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const totals = sorted.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.severity] += 1;

      if (
        row.category === "stale_pending_payout" ||
        row.category === "failed_payout" ||
        row.category === "repeated_payout_failure"
      ) {
        acc.payout += 1;
      } else if (
        row.category === "missing_transfer_reference" ||
        row.category === "duplicate_transfer_reference" ||
        row.category === "orphan_transfer_event"
      ) {
        acc.transfer += 1;
      } else {
        acc.webhook += 1;
      }

      return acc;
    },
    {
      total: 0,
      high: 0,
      medium: 0,
      low: 0,
      payout: 0,
      transfer: 0,
      webhook: 0,
    }
  );

  return {
    rows: sorted,
    totals,
    webhookLedgerAvailable,
  };
}

export async function getAdminPaymentComplianceRecords(limit = 120): Promise<
  | {
      rows: AdminPaymentComplianceRecord[];
      tableAvailable: boolean;
    }
  | ActionError
> {
  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const adminClient = createAdminClient("admin_operations") as any;
  const maxLimit = Math.min(Math.max(10, limit), 300);

  const { data: complianceRows, error: complianceError } = await adminClient
    .from("payment_compliance_records")
    .select(
      "id,transaction_id,legal_entity_name,legal_entity_country,tax_reference,vat_reference,invoice_reference,purchase_order_reference,payout_statement_reference,legal_hold,notes,metadata,created_by,updated_by,created_at,updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(maxLimit);

  if (complianceError) {
    if (isMissingTableError(complianceError, "payment_compliance_records")) {
      return {
        rows: [],
        tableAvailable: false,
      };
    }
    return actionError("DB_ERROR", complianceError.message);
  }

  const rows = (complianceRows ?? []) as Array<{
    id: string;
    transaction_id: string;
    legal_entity_name: string | null;
    legal_entity_country: string | null;
    tax_reference: string | null;
    vat_reference: string | null;
    invoice_reference: string | null;
    purchase_order_reference: string | null;
    payout_statement_reference: string | null;
    legal_hold: boolean | null;
    notes: string | null;
    metadata: unknown;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
  }>;

  if (rows.length === 0) {
    return {
      rows: [],
      tableAvailable: true,
    };
  }

  const transactionIds = rows.map((row) => row.transaction_id);
  const { data: txRows, error: txError } = await adminClient
    .from("transactions")
    .select("id,user_id,type,status,amount,currency,reference_id,dataset_request_id")
    .in("id", transactionIds);

  if (txError) {
    return actionError("DB_ERROR", txError.message);
  }

  const txMap = new Map<
    string,
    {
      id: string;
      user_id: string;
      type: string | null;
      status: string | null;
      amount: number | null;
      currency: string | null;
      reference_id: string | null;
      dataset_request_id: string | null;
    }
  >(
    ((txRows ?? []) as Array<{
      id: string;
      user_id: string;
      type: string | null;
      status: string | null;
      amount: number | null;
      currency: string | null;
      reference_id: string | null;
      dataset_request_id: string | null;
    }>).map((row) => [row.id, row])
  );

  const userIds = Array.from(
    new Set(
      Array.from(txMap.values())
        .map((row) => row.user_id)
        .filter(Boolean)
    )
  );
  const datasetIds = Array.from(
    new Set(
      Array.from(txMap.values())
        .map((row) => row.dataset_request_id)
        .filter(Boolean)
    )
  ) as string[];

  const [profilesRes, datasetsRes] = await Promise.all([
    userIds.length > 0
      ? adminClient
          .from("profiles")
          .select("id,full_name,mail")
          .in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    datasetIds.length > 0
      ? adminClient.from("dataset_requests").select("id,title").in("id", datasetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesRes.error || datasetsRes.error) {
    return actionError(
      "DB_ERROR",
      profilesRes.error?.message ??
        datasetsRes.error?.message ??
        "Failed to load payment compliance references"
    );
  }

  const profileMap = new Map<string, { full_name: string | null; mail: string | null }>(
    (profilesRes.data ?? []).map((row: any) => [
      row.id,
      {
        full_name: row.full_name ?? null,
        mail: row.mail ?? null,
      },
    ])
  );
  const datasetMap = new Map<string, { title: string | null }>(
    (datasetsRes.data ?? []).map((row: any) => [
      row.id,
      {
        title: row.title ?? null,
      },
    ])
  );

  const mapped: AdminPaymentComplianceRecord[] = rows.map((row) => {
    const tx = txMap.get(row.transaction_id);
    const profile = tx?.user_id ? profileMap.get(tx.user_id) : null;
    const dataset = tx?.dataset_request_id
      ? datasetMap.get(tx.dataset_request_id)
      : null;

    return {
      id: row.id,
      transaction_id: row.transaction_id,
      transaction_type: tx?.type ?? null,
      transaction_status: tx?.status ?? null,
      transaction_amount: tx?.amount ?? null,
      transaction_currency: tx?.currency ?? null,
      transaction_reference_id: tx?.reference_id ?? null,
      dataset_request_id: tx?.dataset_request_id ?? null,
      dataset_title: dataset?.title ?? null,
      contributor_id: tx?.user_id ?? null,
      contributor_name: profile?.full_name ?? null,
      contributor_email: profile?.mail ?? null,
      legal_entity_name: row.legal_entity_name ?? null,
      legal_entity_country: row.legal_entity_country ?? null,
      tax_reference: row.tax_reference ?? null,
      vat_reference: row.vat_reference ?? null,
      invoice_reference: row.invoice_reference ?? null,
      purchase_order_reference: row.purchase_order_reference ?? null,
      payout_statement_reference: row.payout_statement_reference ?? null,
      legal_hold: Boolean(row.legal_hold),
      notes: row.notes ?? null,
      metadata: isObjectRecord(row.metadata) ? row.metadata : {},
      created_by: row.created_by ?? null,
      updated_by: row.updated_by ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return {
    rows: mapped,
    tableAvailable: true,
  };
}

export async function upsertAdminPaymentComplianceRecord(
  input: AdminPaymentComplianceUpsertInput
): Promise<{ ok: true } | ActionError> {
  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  const transactionId = String(input.transactionId ?? "").trim();
  if (!transactionId) {
    return actionError("VALIDATION_ERROR", "transactionId is required");
  }

  const legalEntityCountryRaw = normalizeComplianceText(input.legalEntityCountry);
  const legalEntityCountry = legalEntityCountryRaw
    ? legalEntityCountryRaw.toUpperCase()
    : null;
  if (legalEntityCountry && legalEntityCountry.length !== 2) {
    return actionError(
      "VALIDATION_ERROR",
      "legalEntityCountry must be a 2-letter ISO country code"
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminClient = createAdminClient("admin_operations") as any;

  const { data: tx, error: txError } = await adminClient
    .from("transactions")
    .select("id,type")
    .eq("id", transactionId)
    .maybeSingle();

  if (txError || !tx) {
    return actionError(
      txError ? "DB_ERROR" : "NOT_FOUND",
      txError?.message ?? "Transaction not found"
    );
  }

  const eligibleTypes = new Set([
    "dataset_funding",
    "submission_payout",
    "wallet_deposit",
    "wallet_withdrawal",
    "refund",
    "platform_fee",
    "stripe_adjustment",
  ]);
  if (!eligibleTypes.has(String(tx.type ?? ""))) {
    return actionError(
      "VALIDATION_ERROR",
      "Compliance records are only allowed for payment ledger transactions"
    );
  }

  const { data: existing, error: existingError } = await adminClient
    .from("payment_compliance_records")
    .select("id,created_by")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError, "payment_compliance_records")) {
      return actionError(
        "DB_ERROR",
        "payment_compliance_records table is missing; run migrations before writing compliance metadata"
      );
    }
    return actionError("DB_ERROR", existingError.message);
  }

  const payload = {
    transaction_id: transactionId,
    legal_entity_name: normalizeComplianceText(input.legalEntityName),
    legal_entity_country: legalEntityCountry,
    tax_reference: normalizeComplianceText(input.taxReference),
    vat_reference: normalizeComplianceText(input.vatReference),
    invoice_reference: normalizeComplianceText(input.invoiceReference),
    purchase_order_reference: normalizeComplianceText(input.purchaseOrderReference),
    payout_statement_reference: normalizeComplianceText(input.payoutStatementReference),
    legal_hold: input.legalHold === true,
    notes: normalizeComplianceText(input.notes),
    created_by: existing?.created_by ?? user?.id ?? null,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await adminClient
    .from("payment_compliance_records")
    .upsert(payload, { onConflict: "transaction_id" });

  if (upsertError) {
    if (isMissingTableError(upsertError, "payment_compliance_records")) {
      return actionError(
        "DB_ERROR",
        "payment_compliance_records table is missing; run migrations before writing compliance metadata"
      );
    }
    return actionError("DB_ERROR", upsertError.message);
  }

  const activityResult = await writeAdminActivity(supabase, {
    adminId: user?.id,
    actionType: "upsert_payment_compliance_record",
    targetType: "transaction",
    targetId: transactionId,
    notes: `Compliance metadata upserted for transaction ${transactionId}. legal_hold=${payload.legal_hold}.`,
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function reconcilePayoutTransaction(
  transactionId: string,
  nextStatus: "pending" | "cancelled",
  note?: string,
  reasonCode?: string
): Promise<{ ok: true } | ActionError> {
  if (!(await isAdmin())) {
    return actionError("FORBIDDEN", "Admin access required");
  }

  if (!transactionId) {
    return actionError("VALIDATION_ERROR", "Transaction id is required");
  }

  const retryReasonCodes = [
    "bank_details_updated",
    "transient_stripe_error",
    "onboarding_completed",
    "manual_retry",
  ] as const;
  const cancelReasonCodes = [
    "duplicate_payout",
    "submission_reversed",
    "compliance_block",
    "manual_cancellation",
  ] as const;
  const allowedReasonCodes: readonly string[] =
    nextStatus === "pending" ? retryReasonCodes : cancelReasonCodes;
  if (!reasonCode || !allowedReasonCodes.includes(reasonCode)) {
    return actionError(
      "VALIDATION_ERROR",
      `Reason code is required for ${nextStatus} reconciliation`
    );
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
  metadata.reconcile_reason_code = reasonCode;
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
    notes: `Payout status changed from "${tx.status}" to "${nextStatus}" (reason=${reasonCode}). ${note?.trim() ? `Note: ${note.trim()}` : ""}`.trim(),
  });
  if (activityResult) {
    return activityResult;
  }

  revalidatePath("/admin");
  return { ok: true };
}
