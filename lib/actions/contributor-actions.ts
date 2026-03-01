"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";
import { contributorSettingsSchema } from "@/lib/validators/requester-admin";

type ContributorContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

type ContributorSettings = {
  full_name: string;
  bio: string;
  portfolio_url: string;
  timezone: string;
  availability: "open" | "limited" | "unavailable";
  focus_areas: string[];
  notifications: {
    review_updates: boolean;
    payout_updates: boolean;
    recommendations: boolean;
  };
};

function isMissingTableError(error: unknown, tableName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { message?: string; details?: string; hint?: string };
  const message = String(row.message ?? "").toLowerCase();
  const details = String(row.details ?? "").toLowerCase();
  const hint = String(row.hint ?? "").toLowerCase();
  const combined = `${message} ${details} ${hint}`;
  const tableRef = `public.${tableName}`.toLowerCase();
  const relationRef = `relation \"${tableName}\"`;

  return (
    combined.includes(tableRef) &&
      (combined.includes("schema cache") ||
        combined.includes("does not exist") ||
        combined.includes("could not find")) ||
    combined.includes(relationRef)
  );
}

function defaultContributorSettings(fullName = ""): ContributorSettings {
  return {
    full_name: fullName,
    bio: "",
    portfolio_url: "",
    timezone: "",
    availability: "open",
    focus_areas: [],
    notifications: {
      review_updates: true,
      payout_updates: true,
      recommendations: true,
    },
  };
}

async function getContributorContext(): Promise<ContributorContext | ActionError> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return actionError("UNAUTHORIZED", "Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return actionError(
      "DB_ERROR",
      profileError?.message ?? "Unable to load contributor profile"
    );
  }
  if (profile.role !== "contributor" && profile.role !== "admin") {
    return actionError("FORBIDDEN", "Contributor access required");
  }

  return { supabase, userId: user.id };
}

export async function getContributorSettings(): Promise<
  { data: ContributorSettings } | ActionError
> {
  const context = await getContributorContext();
  if ("error" in context) {
    return context;
  }

  const { supabase, userId } = context;

  const [profileRes, settingsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name,bio")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("contributor_settings")
      .select("portfolio_url,timezone,availability,focus_areas,notification_prefs")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileRes.error) {
    return actionError("DB_ERROR", profileRes.error.message);
  }

  if (
    settingsRes.error &&
    !isMissingTableError(settingsRes.error, "contributor_settings")
  ) {
    return actionError("DB_ERROR", settingsRes.error.message);
  }

  const defaults = defaultContributorSettings(profileRes.data?.full_name ?? "");
  defaults.bio = profileRes.data?.bio ?? "";

  if (!settingsRes.data) {
    return { data: defaults };
  }

  const notificationPrefs =
    settingsRes.data.notification_prefs &&
    typeof settingsRes.data.notification_prefs === "object"
      ? (settingsRes.data.notification_prefs as Record<string, unknown>)
      : {};

  return {
    data: {
      full_name: profileRes.data?.full_name ?? "",
      bio: profileRes.data?.bio ?? "",
      portfolio_url: settingsRes.data.portfolio_url ?? "",
      timezone: settingsRes.data.timezone ?? "",
      availability:
        settingsRes.data.availability === "limited" ||
        settingsRes.data.availability === "unavailable"
          ? settingsRes.data.availability
          : "open",
      focus_areas: Array.isArray(settingsRes.data.focus_areas)
        ? settingsRes.data.focus_areas.filter(
            (value): value is string => typeof value === "string"
          )
        : [],
      notifications: {
        review_updates:
          typeof notificationPrefs.review_updates === "boolean"
            ? notificationPrefs.review_updates
            : true,
        payout_updates:
          typeof notificationPrefs.payout_updates === "boolean"
            ? notificationPrefs.payout_updates
            : true,
        recommendations:
          typeof notificationPrefs.recommendations === "boolean"
            ? notificationPrefs.recommendations
            : true,
      },
    },
  };
}

export async function getContributorProfileQuality(): Promise<
  | {
      score: number;
      level: "starter" | "solid" | "trusted";
      checks: Array<{
        id: string;
        label: string;
        completed: boolean;
      }>;
    }
  | ActionError
> {
  const context = await getContributorContext();
  if ("error" in context) {
    return context;
  }

  const { supabase, userId } = context;
  const [profileRes, settingsRes, submissionsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name,bio")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("contributor_settings")
      .select("portfolio_url,timezone,focus_areas")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("submissions")
      .select("status")
      .eq("contributor_id", userId),
  ]);

  if (profileRes.error) {
    return actionError("DB_ERROR", profileRes.error.message);
  }
  if (
    settingsRes.error &&
    !isMissingTableError(settingsRes.error, "contributor_settings")
  ) {
    return actionError("DB_ERROR", settingsRes.error.message);
  }
  if (submissionsRes.error) {
    return actionError("DB_ERROR", submissionsRes.error.message);
  }

  const approvedCount = (submissionsRes.data ?? []).filter(
    (submission) => submission.status === "approved"
  ).length;

  const checks = [
    {
      id: "full_name",
      label: "Display name set",
      completed: Boolean(profileRes.data?.full_name?.trim()),
    },
    {
      id: "bio",
      label: "Bio filled",
      completed: Boolean(profileRes.data?.bio?.trim()),
    },
    {
      id: "portfolio_url",
      label: "Portfolio URL added",
      completed: Boolean(settingsRes.data?.portfolio_url?.trim()),
    },
    {
      id: "focus_areas",
      label: "Focus areas (2+)",
      completed:
        Array.isArray(settingsRes.data?.focus_areas) &&
        settingsRes.data.focus_areas.length >= 2,
    },
    {
      id: "timezone",
      label: "Timezone configured",
      completed: Boolean(settingsRes.data?.timezone?.trim()),
    },
    {
      id: "approved_work",
      label: "At least 3 approved submissions",
      completed: approvedCount >= 3,
    },
  ];

  const score = Math.round(
    (checks.filter((check) => check.completed).length / checks.length) * 100
  );
  const level = score >= 85 ? "trusted" : score >= 60 ? "solid" : "starter";

  return {
    score,
    level,
    checks,
  };
}

export async function saveContributorSettings(
  input: Record<string, unknown>
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    contributorSettingsSchema,
    input,
    "Invalid contributor settings payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const context = await getContributorContext();
  if ("error" in context) {
    return context;
  }

  const { supabase, userId } = context;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: validated.full_name.trim(),
      bio: (validated.bio ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) {
    return actionError("DB_ERROR", profileError.message);
  }

  const { error: settingsError } = await supabase
    .from("contributor_settings")
    .upsert(
      {
        user_id: userId,
        portfolio_url: (validated.portfolio_url ?? "").trim() || null,
        timezone: (validated.timezone ?? "").trim() || null,
        availability: validated.availability,
        focus_areas: validated.focus_areas ?? [],
        notification_prefs: validated.notifications,
      },
      { onConflict: "user_id" }
    );

  if (settingsError) {
    if (isMissingTableError(settingsError, "contributor_settings")) {
      return actionError(
        "DB_ERROR",
        "contributor_settings table is missing. Run latest migrations."
      );
    }
    return actionError("DB_ERROR", settingsError.message);
  }

  revalidatePath("/contributor");
  revalidatePath("/contributor/settings");

  return { ok: true };
}

// Get all contributions for the current user
export async function getUserContributionsDetailed() {
  const context = await getContributorContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, userId } = context;

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
    .eq("contributor_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching contributions:", error);
    return { error: error.message };
  }

  return { data };
}

// Get earnings summary for contributor
export async function getUserEarnings() {
  const context = await getContributorContext();
  if ("error" in context) {
    return {
      totalEarnings: 0,
      pendingEarnings: 0,
      approvedSubmissions: 0,
      pendingSubmissions: 0,
      needsChangesSubmissions: 0,
      rejectedSubmissions: 0,
      totalSubmissions: 0,
    };
  }

  const { supabase, userId } = context;

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
    .eq("contributor_id", userId);

  const stats = {
    totalEarnings: 0,
    pendingEarnings: 0,
    approvedSubmissions: 0,
    pendingSubmissions: 0,
    needsChangesSubmissions: 0,
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
    } else if (sub.status === "needs_changes") {
      stats.needsChangesSubmissions++;
      stats.pendingEarnings += rewardAmount;
    } else if (sub.status === "rejected") {
      stats.rejectedSubmissions++;
    }
  });

  return stats;
}

// Update own submission (pending / needs_changes only)
export async function updateOwnSubmission(
  submissionId: string,
  updates: {
    notes?: string;
    file_urls?: string[];
  }
) {
  const context = await getContributorContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, userId } = context;

  const { data, error } = await supabase
    .from("submissions")
    .update(updates)
    .eq("id", submissionId)
    .eq("contributor_id", userId)
    .in("status", ["pending", "needs_changes"])
    .select()
    .single();

  if (error) {
    console.error("Error updating submission:", error);
    return { error: error.message };
  }

  revalidatePath("/contributor/contributions");
  return { data };
}

// Delete own submission (pending / needs_changes only)
export async function deleteOwnSubmission(submissionId: string) {
  const context = await getContributorContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, userId } = context;

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId)
    .eq("contributor_id", userId)
    .in("status", ["pending", "needs_changes"]);

  if (error) {
    console.error("Error deleting submission:", error);
    return { error: error.message };
  }

  revalidatePath("/contributor/contributions");
  return { success: true };
}

type ContributorDashboardTask = {
  submissionId: string;
  datasetId: string;
  datasetTitle: string;
  status: "pending" | "needs_changes";
  rewardAmount: number;
  updatedAt: string;
  notePreview: string | null;
  actionHref: string;
};

type ContributorFeedbackItem = {
  submissionId: string;
  datasetId: string;
  datasetTitle: string;
  status: "needs_changes" | "rejected";
  notePreview: string | null;
  updatedAt: string;
  actionHref: string;
};

type ContributorPayoutForecast = {
  readyCount: number;
  readyAmount: number;
  pendingTransferCount: number;
  pendingTransferAmount: number;
  failedTransferCount: number;
  failedTransferAmount: number;
};

export async function getContributorDashboardEssentials(): Promise<
  | {
      data: {
        taskInbox: ContributorDashboardTask[];
        feedbackQueue: ContributorFeedbackItem[];
        payoutForecast: ContributorPayoutForecast;
        blockers: string[];
      };
    }
  | ActionError
> {
  const context = await getContributorContext();
  if ("error" in context) {
    return context;
  }

  const { supabase, userId } = context;

  const [submissionsRes, payoutsRes] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        `
        id,
        status,
        notes,
        updated_at,
        dataset_request_id,
        dataset_requests:dataset_request_id (
          id,
          title,
          reward_amount
        )
      `
      )
      .eq("contributor_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("id,status,amount,submission_id,created_at")
      .eq("user_id", userId)
      .eq("type", "submission_payout")
      .order("created_at", { ascending: false }),
  ]);

  if (submissionsRes.error) {
    return actionError("DB_ERROR", submissionsRes.error.message);
  }
  if (payoutsRes.error) {
    return actionError("DB_ERROR", payoutsRes.error.message);
  }

  const submissions = submissionsRes.data ?? [];
  const payoutRows = payoutsRes.data ?? [];

  const payoutStateBySubmission = new Map<
    string,
    { completed: boolean; pending: boolean; failed: boolean }
  >();

  payoutRows.forEach((row) => {
    if (!row.submission_id) {
      return;
    }

    const current = payoutStateBySubmission.get(row.submission_id) ?? {
      completed: false,
      pending: false,
      failed: false,
    };

    if (row.status === "completed") current.completed = true;
    if (row.status === "pending") current.pending = true;
    if (row.status === "failed") current.failed = true;

    payoutStateBySubmission.set(row.submission_id, current);
  });

  const taskInbox: ContributorDashboardTask[] = submissions
    .filter((row) => row.status === "pending" || row.status === "needs_changes")
    .map((row) => {
      const dataset = Array.isArray(row.dataset_requests)
        ? row.dataset_requests[0]
        : row.dataset_requests;

      return {
        submissionId: row.id,
        datasetId: row.dataset_request_id,
        datasetTitle: dataset?.title ?? "Untitled dataset",
        status: row.status as "pending" | "needs_changes",
        rewardAmount: Number(dataset?.reward_amount ?? 0),
        updatedAt: row.updated_at ?? new Date().toISOString(),
        notePreview: row.notes ? String(row.notes).slice(0, 180) : null,
        actionHref: `/contributor/contributions?submission=${row.id}`,
      };
    })
    .sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "needs_changes" ? -1 : 1;
    });

  const feedbackQueue: ContributorFeedbackItem[] = submissions
    .filter((row) => row.status === "needs_changes" || row.status === "rejected")
    .map((row) => {
      const dataset = Array.isArray(row.dataset_requests)
        ? row.dataset_requests[0]
        : row.dataset_requests;
      return {
        submissionId: row.id,
        datasetId: row.dataset_request_id,
        datasetTitle: dataset?.title ?? "Untitled dataset",
        status: row.status as "needs_changes" | "rejected",
        notePreview: row.notes ? String(row.notes).slice(0, 220) : null,
        updatedAt: row.updated_at ?? new Date().toISOString(),
        actionHref: `/contributor/contributions?submission=${row.id}`,
      };
    });

  const approvedNotSettled = submissions.filter((row) => {
    if (row.status !== "approved") {
      return false;
    }

    const payoutState = payoutStateBySubmission.get(row.id);
    return !payoutState?.completed;
  });

  const readyAmount = approvedNotSettled.reduce((sum, row) => {
    const dataset = Array.isArray(row.dataset_requests)
      ? row.dataset_requests[0]
      : row.dataset_requests;
    return sum + Number(dataset?.reward_amount ?? 0);
  }, 0);

  const pendingTransferRows = payoutRows.filter((row) => row.status === "pending");
  const failedTransferRows = payoutRows.filter((row) => row.status === "failed");

  const payoutForecast: ContributorPayoutForecast = {
    readyCount: approvedNotSettled.length,
    readyAmount,
    pendingTransferCount: pendingTransferRows.length,
    pendingTransferAmount: pendingTransferRows.reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0
    ),
    failedTransferCount: failedTransferRows.length,
    failedTransferAmount: failedTransferRows.reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0
    ),
  };

  const blockers: string[] = [];
  if (feedbackQueue.length > 0) {
    blockers.push(
      `${feedbackQueue.length} submission${feedbackQueue.length === 1 ? "" : "s"} require reviewer feedback follow-up.`
    );
  }
  if (payoutForecast.failedTransferCount > 0) {
    blockers.push(
      `${payoutForecast.failedTransferCount} payout transfer${payoutForecast.failedTransferCount === 1 ? "" : "s"} failed and need admin reconciliation.`
    );
  }
  if (taskInbox.length === 0 && blockers.length === 0) {
    blockers.push("No immediate blockers. Keep monitoring new dataset opportunities.");
  }

  return {
    data: {
      taskInbox: taskInbox.slice(0, 8),
      feedbackQueue: feedbackQueue.slice(0, 8),
      payoutForecast,
      blockers,
    },
  };
}
