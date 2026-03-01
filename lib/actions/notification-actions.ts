"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionError, type ActionError } from "@/lib/validators/action-envelope";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  severity: "info" | "warning" | "critical";
  created_at: string;
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

function normalizeIso(value: string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

export async function getNotificationFeed(
  limit = 20
): Promise<{ data: { items: NotificationItem[]; unreadCount: number } } | ActionError> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return actionError("UNAUTHORIZED", "Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return actionError("DB_ERROR", profileError?.message ?? "Unable to load profile");
  }

  const notificationLimit = Math.min(100, Math.max(1, limit));
  const stateRes = await supabase
    .from("user_notification_state")
    .select("last_seen_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    stateRes.error &&
    !isMissingTableError(stateRes.error, "user_notification_state")
  ) {
    return actionError("DB_ERROR", stateRes.error.message);
  }

  const lastSeenAt = normalizeIso(stateRes.data?.last_seen_at);
  const adminClient = createAdminClient("notifications") as any;
  const items: NotificationItem[] = [];

  if (profile.role === "requester") {
    const datasetsRes = await supabase
      .from("dataset_requests")
      .select("id,title,created_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (datasetsRes.error) {
      return actionError("DB_ERROR", datasetsRes.error.message);
    }

    const datasetIds = (datasetsRes.data ?? []).map((dataset) => dataset.id);
    if (datasetIds.length > 0) {
      const [submissionsRes, exportsRes] = await Promise.all([
        supabase
          .from("submissions")
          .select("id,status,updated_at,dataset_request_id")
          .in("dataset_request_id", datasetIds)
          .order("updated_at", { ascending: false })
          .limit(30),
        supabase
          .from("dataset_exports")
          .select("id,status,completed_at,dataset_request_id")
          .in("dataset_request_id", datasetIds)
          .eq("status", "ready")
          .order("completed_at", { ascending: false })
          .limit(20),
      ]);

      if (submissionsRes.error) {
        return actionError("DB_ERROR", submissionsRes.error.message);
      }
      if (
        exportsRes.error &&
        !isMissingTableError(exportsRes.error, "dataset_exports")
      ) {
        return actionError("DB_ERROR", exportsRes.error.message);
      }

      (submissionsRes.data ?? []).forEach((submission) => {
        if (submission.status === "pending" || submission.status === "needs_changes") {
          items.push({
            id: `submission-${submission.id}`,
            title: "Review queue updated",
            body:
              submission.status === "needs_changes"
                ? "A submission is waiting for revision feedback."
                : "A new submission is awaiting review.",
            href: "/requester/datasets?filter=pending_review",
            severity: submission.status === "needs_changes" ? "warning" : "info",
            created_at: normalizeIso(submission.updated_at),
          });
        }
      });

      (exportsRes.data ?? []).forEach((record) => {
        items.push({
          id: `export-${record.id}`,
          title: "Dataset export ready",
          body: "A dataset export has completed and is ready to download.",
          href: "/requester/files",
          severity: "info",
          created_at: normalizeIso(record.completed_at),
        });
      });
    }
  }

  if (profile.role === "contributor") {
    const [submissionsRes, payoutsRes] = await Promise.all([
      supabase
        .from("submissions")
        .select("id,status,updated_at,notes")
        .eq("contributor_id", user.id)
        .in("status", ["approved", "rejected", "needs_changes"])
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from("transactions")
        .select("id,status,created_at,type")
        .eq("user_id", user.id)
        .eq("type", "submission_payout")
        .in("status", ["pending", "completed", "failed"])
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (submissionsRes.error || payoutsRes.error) {
      return actionError(
        "DB_ERROR",
        submissionsRes.error?.message ??
          payoutsRes.error?.message ??
          "Failed to load contributor notifications"
      );
    }

    (submissionsRes.data ?? []).forEach((submission) => {
      const severity: NotificationItem["severity"] =
        submission.status === "rejected"
          ? "critical"
          : submission.status === "needs_changes"
            ? "warning"
            : "info";

      items.push({
        id: `submission-status-${submission.id}`,
        title: `Submission ${submission.status.replaceAll("_", " ")}`,
        body: submission.notes || "Your submission status has changed.",
        href: "/contributor/contributions",
        severity,
        created_at: normalizeIso(submission.updated_at),
      });
    });

    (payoutsRes.data ?? []).forEach((payout) => {
      items.push({
        id: `payout-${payout.id}`,
        title:
          payout.status === "failed"
            ? "Payout failed"
            : payout.status === "pending"
              ? "Payout pending"
              : "Payout settled",
        body:
          payout.status === "failed"
            ? "A payout failed and requires admin reconciliation."
            : payout.status === "pending"
              ? "A payout transfer is in progress."
              : "A payout has been settled.",
        href: "/contributor/earnings",
        severity:
          payout.status === "failed"
            ? "critical"
            : payout.status === "pending"
              ? "warning"
              : "info",
        created_at: normalizeIso(payout.created_at),
      });
    });
  }

  if (profile.role === "admin") {
    const [requestsRes, submissionsRes, failedPayoutsRes, ticketsRes] =
      await Promise.all([
        supabase
          .from("dataset_requests")
          .select("id,title,created_at")
          .eq("approval_status", "pending")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("submissions")
          .select("id,created_at,status")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("transactions")
          .select("id,created_at,status,type")
          .eq("type", "submission_payout")
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(20),
        adminClient
          .from("support_tickets")
          .select("id,status,priority,updated_at")
          .in("status", ["open", "in_progress"])
          .order("updated_at", { ascending: false })
          .limit(20),
      ]);

    if (
      requestsRes.error ||
      submissionsRes.error ||
      failedPayoutsRes.error ||
      ticketsRes.error
    ) {
      return actionError(
        "DB_ERROR",
        requestsRes.error?.message ??
          submissionsRes.error?.message ??
          failedPayoutsRes.error?.message ??
          ticketsRes.error?.message ??
          "Failed to load admin notifications"
      );
    }

    (requestsRes.data ?? []).forEach((request) => {
      items.push({
        id: `admin-request-${request.id}`,
        title: "New dataset request pending",
        body: request.title || "A dataset request requires approval.",
        href: "/admin/requests",
        severity: "info",
        created_at: normalizeIso(request.created_at),
      });
    });

    (submissionsRes.data ?? []).forEach((submission) => {
      items.push({
        id: `admin-submission-${submission.id}`,
        title: "Submission awaiting review",
        body: "Contributor submission is pending moderation.",
        href: "/admin/submissions",
        severity: "warning",
        created_at: normalizeIso(submission.created_at),
      });
    });

    (failedPayoutsRes.data ?? []).forEach((payout) => {
      items.push({
        id: `admin-payout-${payout.id}`,
        title: "Failed payout detected",
        body: "A payout transaction failed and should be reconciled.",
        href: "/admin/payments",
        severity: "critical",
        created_at: normalizeIso(payout.created_at),
      });
    });

    (ticketsRes.data ?? []).forEach((ticket: any) => {
      items.push({
        id: `admin-ticket-${ticket.id}`,
        title: "Support ticket needs triage",
        body: `${ticket.status} / ${ticket.priority}`,
        href: "/admin/support",
        severity: ticket.priority === "urgent" ? "critical" : "warning",
        created_at: normalizeIso(ticket.updated_at),
      });
    });
  }

  const sorted = items
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, notificationLimit);

  const unreadCount = sorted.filter(
    (item) => new Date(item.created_at).getTime() > new Date(lastSeenAt).getTime()
  ).length;

  return {
    data: {
      items: sorted,
      unreadCount,
    },
  };
}

export async function markNotificationsRead(): Promise<{ ok: true } | ActionError> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return actionError("UNAUTHORIZED", "Not authenticated");
  }

  const { error } = await supabase.from("user_notification_state").upsert(
    {
      user_id: user.id,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error && !isMissingTableError(error, "user_notification_state")) {
    return actionError("DB_ERROR", error.message);
  }

  return { ok: true };
}
