'use server';

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { processPendingDatasetExportJobs } from "@/lib/jobs/export-jobs";
import { SPACES_BUCKET, CDN_URL } from "@/lib/storage/spaces-client";
import { recordFunnelEvent } from "@/lib/analytics/funnel-events-server";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";
import {
  requesterApiKeyGenerateSchema,
  requesterApiKeyRevokeSchema,
  requesterAutomationConfigSchema,
  requesterDatasetIdSchema,
  requesterDatasetListFiltersSchema,
  requesterDatasetStatusUpdateSchema,
  requesterDatasetCreateSchema,
  requesterDatasetUpdateSchema,
  requesterExportIdSchema,
  requesterOnboardingUpdateSchema,
  requesterOrgSettingsSchema,
  requesterSupportTicketIdSchema,
  requesterSupportTicketReplySchema,
  requesterSupportTicketSchema,
} from "@/lib/validators/requester-admin";

type RequesterRole = "requester" | "admin" | "both";

const REQUESTER_ALLOWED_ROLES = new Set<RequesterRole>([
  "requester",
  "admin",
  "both",
]);

const ONBOARDING_ORDER = ["profile", "dataset", "download"] as const;
type OnboardingStepId = (typeof ONBOARDING_ORDER)[number];
type OnboardingStepStatus = "pending" | "in_progress" | "done";

const ONBOARDING_LABELS: Record<OnboardingStepId, string> = {
  profile: "Complete profile",
  dataset: "Create dataset",
  download: "Download data",
};

const DEFAULT_ONBOARDING_STATUS: Record<OnboardingStepId, OnboardingStepStatus> = {
  profile: "in_progress",
  dataset: "pending",
  download: "pending",
};

const EXPORT_STATUS_PRIORITY: Record<string, number> = {
  ready: 0,
  preparing: 1,
  pending: 2,
  failed: 3,
  expired: 4,
  cancelled: 5,
};

const STATUS_TRANSITIONS: Record<string, Array<"paused" | "active" | "archived">> = {
  draft: ["active", "archived"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  "closing-soon": ["active", "paused", "archived"],
  completed: ["archived"],
  archived: [],
};

export type DatasetListFilters = {
  search?: string;
  quickFilter?: "needs_funding" | "pending_review" | "download_ready" | "drafts";
  status?: string[];
  page?: number;
  perPage?: number;
};

export type DatasetListItem = {
  id: string;
  title: string;
  status: string;
  approval_status: string;
  reward_amount: number | null;
  data_type: string;
  samples_collected: number;
  samples_needed: number;
  total_budget: number | null;
  paid_amount: number | null;
  pendingSubmissions: number;
  latestExport?: { status?: string | null } | null;
  [key: string]: unknown;
};

type RequesterAuthContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

type RawSubmission = {
  status?: string | null;
  created_at?: string | null;
  dataset_request_id?: string | null;
  dataset_requests?: { title?: string | null } | Array<{ title?: string | null }> | null;
};

type RawDatasetExport = {
  id: string;
  dataset_request_id: string;
  status: string;
  export_type: string;
  created_at: string;
  completed_at: string | null;
  size_bytes?: number | null;
  progress?: number | null;
  error?: string | null;
  file_url?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
  dataset_requests?: { title?: string; created_by?: string } | Array<{ title?: string; created_by?: string }> | null;
};

type RawRequesterDataset = {
  id: string;
  title: string;
  category?: string | null;
  description?: string | null;
  status?: string | null;
  approval_status?: string | null;
  reward_amount?: number | null;
  data_type?: string | null;
  samples_collected?: number | null;
  samples_needed?: number | null;
  total_budget?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  created_at?: string | null;
  submissions?: RawSubmission[] | null;
  dataset_exports?: RawDatasetExport[] | null;
};

type SupportTicketMessage = {
  id: string;
  role: "requester" | "admin" | "system";
  body: string;
  created_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const message = String(error.message ?? "").toLowerCase();
  const details = String(error.details ?? "").toLowerCase();
  const hint = String(error.hint ?? "").toLowerCase();
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

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dollarsFromCents(value: unknown): number {
  return toNumber(value) / 100;
}

function extractDatasetTitle(
  relation: { title?: string | null } | Array<{ title?: string | null }> | null | undefined
): string | null {
  if (!relation) return null;
  if (Array.isArray(relation)) {
    return relation[0]?.title ?? null;
  }
  return relation.title ?? null;
}

function getLatestExport(records: RawDatasetExport[]): RawDatasetExport | null {
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}

function getPendingSubmissionCount(submissions: RawSubmission[]): number {
  return submissions.filter((sub) => {
    return sub.status === "pending" || sub.status === "needs_changes";
  }).length;
}

function parseSupportMessages(messages: unknown): SupportTicketMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((entry) => isRecord(entry))
    .map((entry) => {
      const role = String(entry.role ?? "requester");
      return {
        id: String(entry.id ?? randomUUID()),
        role:
          role === "admin" || role === "system" ? role : "requester",
        body: String(entry.body ?? "").trim(),
        created_at: String(entry.created_at ?? new Date().toISOString()),
      } as SupportTicketMessage;
    })
    .filter((entry) => entry.body.length > 0)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
}

async function getRequesterAuthContext(): Promise<RequesterAuthContext | ActionError> {
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

  if (profileError) {
    return actionError("DB_ERROR", profileError.message);
  }

  const role = String(profile?.role ?? "") as RequesterRole;

  if (!REQUESTER_ALLOWED_ROLES.has(role)) {
    return actionError("FORBIDDEN", "Requester access required");
  }

  return { supabase, userId: user.id };
}

function resolveExportUrlFromRecord(record: RawDatasetExport): string | null {
  const directUrl = typeof record.file_url === "string" ? record.file_url : "";
  if (directUrl.startsWith("http://") || directUrl.startsWith("https://")) {
    return directUrl;
  }

  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const metadataUrl = typeof metadata.download_url === "string" ? metadata.download_url : "";
  if (metadataUrl.startsWith("http://") || metadataUrl.startsWith("https://")) {
    return metadataUrl;
  }

  const keyFromMetadata = typeof metadata.object_key === "string" ? metadata.object_key : "";
  const keyFromFileUrl = directUrl.startsWith("/") ? directUrl.slice(1) : directUrl;
  const objectKey = keyFromMetadata || keyFromFileUrl;

  if (!objectKey) {
    return null;
  }

  const cdnBase = (CDN_URL || "").replace(/\/$/, "");
  if (cdnBase) {
    return `${cdnBase}/${objectKey.replace(/^\//, "")}`;
  }

  const endpoint = (process.env.DO_SPACES_ENDPOINT || "").replace(/\/$/, "");
  if (!endpoint || !SPACES_BUCKET) {
    return null;
  }

  return `${endpoint}/${SPACES_BUCKET}/${objectKey.replace(/^\//, "")}`;
}

async function writeDatasetActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  datasetId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<{ ok: true } | ActionError> {
  const { error } = await supabase.from("dataset_activity").insert({
    dataset_request_id: datasetId,
    actor_id: userId,
    actor_role: "requester",
    action,
    metadata,
  });

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  return { ok: true };
}

export async function getRequesterDatasets(
  filters: DatasetListFilters
): Promise<{ items: DatasetListItem[]; total: number; perPage: number } | ActionError> {
  const parsedFilters = parseInput(
    requesterDatasetListFiltersSchema,
    filters,
    "Invalid dataset filters"
  );
  if (!parsedFilters.success) {
    return parsedFilters.error;
  }

  const normalizedFilters = parsedFilters.data;
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const perPage = Math.min(50, Math.max(1, normalizedFilters.perPage ?? 10));
  const page = Math.max(1, normalizedFilters.page ?? 1);
  const normalizedSearch = (normalizedFilters.search ?? "").trim().toLowerCase();
  const statusFilter = new Set(
    (normalizedFilters.status ?? [])
      .map((status) => status.toLowerCase())
      .filter(Boolean)
  );

  const { data, error } = await supabase
    .from("dataset_requests")
    .select(`
      id,
      title,
      description,
      status,
      approval_status,
      reward_amount,
      data_type,
      samples_collected,
      samples_needed,
      total_budget,
      paid_amount,
      payment_status,
      created_at,
      submissions(status)
    `)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  const rows = (data ?? []) as RawRequesterDataset[];
  const datasetIds = rows.map((row) => row.id);
  const exportsByDataset = new Map<string, RawDatasetExport[]>();

  if (datasetIds.length > 0) {
    const { data: exportsData, error: exportsError } = await supabase
      .from("dataset_exports")
      .select("id,dataset_request_id,status,export_type,created_at,completed_at,size_bytes,progress,error,expires_at")
      .in("dataset_request_id", datasetIds);

    if (exportsError && !isMissingTableError(exportsError, "dataset_exports")) {
      return actionError("DB_ERROR", exportsError.message);
    }

    for (const record of ((exportsData ?? []) as RawDatasetExport[])) {
      const existing = exportsByDataset.get(record.dataset_request_id) ?? [];
      existing.push(record);
      exportsByDataset.set(record.dataset_request_id, existing);
    }
  }

  const filtered = rows.filter((row) => {
    const title = String(row.title ?? "");
    const description = String(row.description ?? "");
    const dataType = String(row.data_type ?? "");
    const rowStatus = String(row.status ?? "");

    const submissions = Array.isArray(row.submissions) ? row.submissions : [];
    const exports = exportsByDataset.get(row.id) ?? [];
    const pendingSubmissions = getPendingSubmissionCount(submissions);
    const latestExport = getLatestExport(exports);

    const totalBudget = toNumber(row.total_budget);
    const paidAmount = toNumber(row.paid_amount);
    const fundedPercentage = totalBudget > 0 ? Math.round((paidAmount / totalBudget) * 100) : 100;
    const needsFunding =
      totalBudget > 0 &&
      (paidAmount < totalBudget ||
        row.payment_status === "unpaid" ||
        row.payment_status === "partial");

    if (normalizedSearch) {
      const searchable = `${title} ${description} ${dataType}`.toLowerCase();
      if (!searchable.includes(normalizedSearch)) {
        return false;
      }
    }

    if (statusFilter.size > 0 && !statusFilter.has(rowStatus.toLowerCase())) {
      return false;
    }

    switch (normalizedFilters.quickFilter) {
      case "needs_funding":
        return needsFunding && fundedPercentage < 100;
      case "pending_review":
        return pendingSubmissions > 0;
      case "download_ready":
        return latestExport?.status === "ready";
      case "drafts":
        return rowStatus === "draft";
      default:
        return true;
    }
  });

  const start = (page - 1) * perPage;
  const paginated = filtered.slice(start, start + perPage);

  const items: DatasetListItem[] = paginated.map((row) => {
    const submissions = Array.isArray(row.submissions) ? row.submissions : [];
    const exports = exportsByDataset.get(row.id) ?? [];
    const latestExport = getLatestExport(exports);

    return {
      id: row.id,
      title: row.title,
      status: row.status ?? "draft",
      approval_status: row.approval_status ?? "pending",
      reward_amount: row.reward_amount ?? null,
      data_type: row.data_type ?? "",
      samples_collected: toNumber(row.samples_collected),
      samples_needed: toNumber(row.samples_needed),
      total_budget: row.total_budget ?? null,
      paid_amount: row.paid_amount ?? null,
      pendingSubmissions: getPendingSubmissionCount(submissions),
      latestExport: latestExport ? { status: latestExport.status } : null,
    };
  });

  return {
    items,
    total: filtered.length,
    perPage,
  };
}

export async function updateDatasetStatus(
  id: string,
  status: "paused" | "active" | "archived"
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    requesterDatasetStatusUpdateSchema,
    { id, status },
    "Invalid dataset status update payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }

  const validated = parsedInput.data;
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data: dataset, error: fetchError } = await supabase
    .from("dataset_requests")
    .select("id,status,title")
    .eq("id", validated.id)
    .eq("created_by", userId)
    .single();

  if (fetchError || !dataset) {
    return actionError("NOT_FOUND", "Dataset not found or access denied");
  }

  const currentStatus = String(dataset.status ?? "draft");
  if (currentStatus === validated.status) {
    return { ok: true };
  }

  const allowedTransitions = STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowedTransitions.includes(validated.status)) {
    return actionError(
      "CONFLICT",
      `Invalid status transition from "${currentStatus}" to "${validated.status}"`
    );
  }

  const { error: updateError } = await supabase
    .from("dataset_requests")
    .update({
      status: validated.status,
      archived_at:
        validated.status === "archived" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", validated.id)
    .eq("created_by", userId);

  if (updateError) {
    return actionError("DB_ERROR", updateError.message);
  }

  const activity = await writeDatasetActivity(supabase, userId, validated.id, "status_updated", {
    from_status: currentStatus,
    to_status: validated.status,
  });

  if ("error" in activity) {
    return actionError(
      "DB_ERROR",
      `Status updated but activity logging failed: ${activity.error}`
    );
  }

  revalidatePath("/requester");
  revalidatePath("/requester/datasets");
  revalidatePath(`/requester/datasets/${validated.id}`);

  return { ok: true };
}

export async function duplicateDataset(
  id: string
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    requesterDatasetIdSchema,
    { id },
    "Invalid dataset id"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }

  const validated = parsedInput.data;
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data: source, error: sourceError } = await supabase
    .from("dataset_requests")
    .select(`
      id,
      title,
      description,
      category,
      data_type,
      samples_needed,
      reward_amount,
      currency,
      deadline,
      quality_criteria,
      requirements,
      image_url,
      attachments,
      automation_config,
      funding_model,
      commission_percentage
    `)
    .eq("id", validated.id)
    .eq("created_by", userId)
    .single();

  if (sourceError || !source) {
    return actionError("NOT_FOUND", "Dataset not found or access denied");
  }

  const samplesNeeded = toNumber(source.samples_needed);
  const rewardAmount = toNumber(source.reward_amount);
  const totalBudget = samplesNeeded * rewardAmount;
  const title = String(source.title ?? "Dataset").trim();
  const duplicateTitle = title.endsWith("(Copy)") ? `${title} ${Date.now()}` : `${title} (Copy)`;

  const { data: duplicated, error: insertError } = await supabase
    .from("dataset_requests")
    .insert({
      created_by: userId,
      title: duplicateTitle,
      description: source.description ?? "",
      category: source.category,
      data_type: source.data_type,
      status: "draft",
      approval_status: "pending",
      samples_needed: samplesNeeded,
      samples_collected: 0,
      reward_amount: rewardAmount,
      currency: source.currency ?? "USD",
      deadline: source.deadline ?? new Date().toISOString().slice(0, 10),
      quality_criteria: Array.isArray(source.quality_criteria) ? source.quality_criteria : [],
      requirements: Array.isArray(source.requirements) ? source.requirements : [],
      featured: false,
      image_url: source.image_url ?? null,
      attachments: source.attachments ?? [],
      automation_config: source.automation_config ?? {},
      funding_model: source.funding_model ?? "upfront",
      commission_percentage: source.commission_percentage ?? 10,
      total_budget: totalBudget || null,
      paid_amount: 0,
      payment_status: "unpaid",
    })
    .select("id")
    .single();

  if (insertError || !duplicated) {
    return actionError(
      "DB_ERROR",
      insertError?.message ?? "Failed to duplicate dataset"
    );
  }

  const activity = await writeDatasetActivity(
    supabase,
    userId,
    duplicated.id,
    "duplicated_from",
    {
      source_dataset_id: validated.id,
    }
  );

  if ("error" in activity) {
    return actionError(
      "DB_ERROR",
      `Dataset duplicated but activity logging failed: ${activity.error}`
    );
  }

  revalidatePath("/requester");
  revalidatePath("/requester/datasets");
  revalidatePath("/requester/datasets/new");

  return { ok: true };
}

export async function createRequesterDataset(
  input: Record<string, unknown>
): Promise<{ id: string } | ActionError> {
  const parsedInput = parseInput(
    requesterDatasetCreateSchema,
    input,
    "Invalid dataset payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const totalBudget = Number(validated.samplesNeeded) * Number(validated.rewardAmount);
  const targetStatus = validated.publish ? "paused" : "draft";
  const now = new Date().toISOString();

  const { data: created, error } = await supabase
    .from("dataset_requests")
    .insert({
      created_by: userId,
      title: validated.title.trim(),
      description: validated.description.trim(),
      category: validated.category,
      data_type: validated.dataType,
      status: targetStatus,
      approval_status: "pending",
      samples_needed: validated.samplesNeeded,
      samples_collected: 0,
      reward_amount: validated.rewardAmount,
      currency: validated.currency.toUpperCase(),
      deadline: validated.deadline,
      quality_criteria: validated.qualityCriteria,
      requirements: validated.requirements,
      featured: false,
      image_url: validated.imageUrl || null,
      total_budget: totalBudget || null,
      paid_amount: 0,
      payment_status: "unpaid",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !created) {
    return actionError("DB_ERROR", error?.message ?? "Failed to create dataset");
  }

  const activity = await writeDatasetActivity(
    supabase,
    userId,
    created.id,
    "created_from_builder",
    { publish: validated.publish }
  );

  if ("error" in activity) {
    return actionError(
      "DB_ERROR",
      `Dataset created but activity logging failed: ${activity.error}`
    );
  }

  if (validated.publish) {
    await updateOnboardingStep("dataset", "done");
  }

  await recordFunnelEvent({
    eventName: "funnel_dataset_created",
    userId,
    userRole: "requester",
    source: "server",
    payload: {
      dataset_id: created.id,
      publish: validated.publish,
    },
  });

  revalidatePath("/requester");
  revalidatePath("/requester/datasets");
  revalidatePath("/requester/datasets/new");

  return { id: created.id };
}

export async function updateRequesterDataset(
  input: Record<string, unknown>
): Promise<{ id: string } | ActionError> {
  const parsedInput = parseInput(
    requesterDatasetUpdateSchema,
    input,
    "Invalid dataset payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data: existing, error: existingError } = await supabase
    .from("dataset_requests")
    .select("id,status")
    .eq("id", validated.datasetId)
    .eq("created_by", userId)
    .single();

  if (existingError || !existing) {
    return actionError("NOT_FOUND", "Dataset not found or access denied");
  }

  const currentStatus = String(existing.status ?? "draft");
  const nextStatus =
    validated.publish && currentStatus === "draft" ? "paused" : currentStatus;
  const totalBudget = Number(validated.samplesNeeded) * Number(validated.rewardAmount);

  const { error } = await supabase
    .from("dataset_requests")
    .update({
      title: validated.title.trim(),
      description: validated.description.trim(),
      category: validated.category,
      data_type: validated.dataType,
      status: nextStatus,
      samples_needed: validated.samplesNeeded,
      reward_amount: validated.rewardAmount,
      currency: validated.currency.toUpperCase(),
      deadline: validated.deadline,
      quality_criteria: validated.qualityCriteria,
      requirements: validated.requirements,
      image_url: validated.imageUrl || null,
      total_budget: totalBudget || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", validated.datasetId)
    .eq("created_by", userId);

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  const activity = await writeDatasetActivity(
    supabase,
    userId,
    validated.datasetId,
    "updated_from_builder",
    {
      publish: validated.publish,
      from_status: currentStatus,
      to_status: nextStatus,
    }
  );

  if ("error" in activity) {
    return actionError(
      "DB_ERROR",
      `Dataset updated but activity logging failed: ${activity.error}`
    );
  }

  if (validated.publish) {
    await updateOnboardingStep("dataset", "done");
  }

  revalidatePath("/requester");
  revalidatePath("/requester/datasets");
  revalidatePath(`/requester/datasets/${validated.datasetId}`);
  revalidatePath(`/requester/datasets/${validated.datasetId}/edit`);

  return { id: validated.datasetId };
}

export async function requestDatasetExport(
  datasetId: string
): Promise<{ id: string } | ActionError> {
  const parsedInput = parseInput(
    requesterDatasetIdSchema,
    { id: datasetId },
    "Invalid dataset id"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data: dataset, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("id,title")
    .eq("id", validated.id)
    .eq("created_by", userId)
    .single();

  if (datasetError || !dataset) {
    return actionError("NOT_FOUND", "Dataset not found or access denied");
  }

  const { data: createdExport, error: createExportError } = await supabase
    .from("dataset_exports")
    .insert({
      dataset_request_id: validated.id,
      requested_by: userId,
      status: "pending",
      export_type: "full",
      progress: 0,
      metadata: {
        requested_at: new Date().toISOString(),
        format: "json",
      },
    })
    .select(`
      id,
      dataset_request_id,
      status,
      export_type,
      created_at,
      completed_at
    `)
    .single();

  if (createExportError || !createdExport) {
    return actionError(
      "DB_ERROR",
      createExportError?.message ?? "Failed to create export job"
    );
  }

  const exportId = createdExport.id as string;

  const activity = await writeDatasetActivity(
    supabase,
    userId,
    validated.id,
    "export_requested",
    {
      export_id: exportId,
      export_type: "full",
    }
  );

  if ("error" in activity) {
    return actionError(
      "DB_ERROR",
      `Export created but activity logging failed: ${activity.error}`
    );
  }

  // Durable queue is the source of truth. This optional kick is best-effort only.
  void processPendingDatasetExportJobs({ exportId }).catch((error) => {
    console.error("Failed to trigger export job processor", {
      exportId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  revalidatePath("/requester/files");
  revalidatePath(`/requester/datasets/${validated.id}`);

  return { id: exportId };
}

export async function generateSignedExportUrl(
  exportId: string
): Promise<{ url: string } | ActionError> {
  const parsedInput = parseInput(
    requesterExportIdSchema,
    { exportId },
    "Invalid export id"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data: exportRow, error } = await supabase
    .from("dataset_exports")
    .select(`
      id,
      dataset_request_id,
      status,
      export_type,
      created_at,
      completed_at,
      file_url,
      expires_at,
      metadata
    `)
    .eq("id", validated.exportId)
    .single();

  if (error || !exportRow) {
    return actionError("NOT_FOUND", "Export not found");
  }

  const { data: datasetRow, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("created_by")
    .eq("id", exportRow.dataset_request_id)
    .maybeSingle();

  if (datasetError || !datasetRow) {
    return actionError("NOT_FOUND", "Export not found or access denied");
  }
  const ownerId = datasetRow.created_by;

  if (ownerId !== userId) {
    return actionError("FORBIDDEN", "Export not found or access denied");
  }

  if (exportRow.status !== "ready") {
    return actionError("CONFLICT", `Export is currently "${exportRow.status}"`);
  }

  if (exportRow.expires_at && new Date(exportRow.expires_at).getTime() < Date.now()) {
    await supabase
      .from("dataset_exports")
      .update({ status: "expired" })
      .eq("id", validated.exportId);
    return actionError("CONFLICT", "Export has expired. Please generate a new export.");
  }

  const url = resolveExportUrlFromRecord(exportRow as RawDatasetExport);
  if (!url) {
    return actionError("NOT_FOUND", "No download URL is available for this export");
  }

  await writeDatasetActivity(
    supabase,
    userId,
    exportRow.dataset_request_id,
    "export_download_requested",
    {
      export_id: validated.exportId,
    }
  );

  return { url };
}

export async function saveAutomationConfig(
  datasetId: string,
  config: Record<string, unknown>
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    requesterAutomationConfigSchema,
    { datasetId, config },
    "Invalid automation payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { error } = await supabase
    .from("dataset_requests")
    .update({
      automation_config: config,
      updated_at: new Date().toISOString(),
    })
    .eq("id", validated.datasetId)
    .eq("created_by", userId);

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  const activity = await writeDatasetActivity(
    supabase,
    userId,
    validated.datasetId,
    "automation_updated",
    {
      keys: Object.keys(validated.config),
    }
  );

  if ("error" in activity) {
    return actionError(
      "DB_ERROR",
      `Automation saved but activity logging failed: ${activity.error}`
    );
  }

  revalidatePath(`/requester/datasets/${validated.datasetId}`);
  revalidatePath("/requester/datasets");

  return { ok: true };
}

export async function getDatasetExports(): Promise<
  Array<{
    id: string;
    dataset_request_id: string;
    status: string;
    export_type: string;
    created_at: string;
    completed_at: string | null;
    size_bytes: number | null;
    progress: number | null;
    error: string | null;
    expires_at: string | null;
    dataset_requests?: { title?: string } | null;
  }> | ActionError
> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const { data: ownedDatasets, error: ownedDatasetsError } = await supabase
    .from("dataset_requests")
    .select("id,title")
    .eq("created_by", userId);

  if (ownedDatasetsError) {
    return actionError("DB_ERROR", ownedDatasetsError.message);
  }

  const ownedDatasetRows = (ownedDatasets ?? []) as Array<{ id: string; title?: string | null }>;
  const ownedDatasetIds = ownedDatasetRows.map((row) => row.id);
  const titleByDatasetId = new Map<string, string>(
    ownedDatasetRows.map((row) => [row.id, row.title ?? "Dataset"])
  );

  if (ownedDatasetIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("dataset_exports")
    .select(`
      id,
      dataset_request_id,
      status,
      export_type,
      created_at,
      completed_at,
      size_bytes,
      progress,
      error,
      expires_at
    `)
    .in("dataset_request_id", ownedDatasetIds);

  if (error && !isMissingTableError(error, "dataset_exports")) {
    return actionError("DB_ERROR", error.message);
  }

  const rows = (data ?? []) as RawDatasetExport[];

  return rows
    .sort((a, b) => {
      const aPriority = EXPORT_STATUS_PRIORITY[a.status] ?? 99;
      const bPriority = EXPORT_STATUS_PRIORITY[b.status] ?? 99;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .map((row) => ({
      id: row.id,
      dataset_request_id: row.dataset_request_id,
      status: row.status,
      export_type: row.export_type,
      created_at: row.created_at,
      completed_at: row.completed_at,
      size_bytes: row.size_bytes ?? null,
      progress: row.progress ?? null,
      error: row.error ?? null,
      expires_at: row.expires_at ?? null,
      dataset_requests: {
        title: titleByDatasetId.get(row.dataset_request_id) ?? "Dataset",
      },
    }));
}

export async function getRequesterAnalytics(): Promise<
  | {
      timeseries: Array<{ date: string; submissions: number; approvals: number }>;
      submissions: Array<{ status: string; dataset?: { title?: string | null } | null; created_at?: string | null }>;
      datasets: Array<{ id: string; title: string; status?: string }>;
      categoryBreakdown: Record<string, number>;
    }
  | ActionError
> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data: datasets, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("id,title,status,category,created_at")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (datasetError) {
    return actionError("DB_ERROR", datasetError.message);
  }

  const datasetRows = (datasets ?? []) as Array<{
    id: string;
    title: string;
    status?: string | null;
    category?: string | null;
    created_at?: string | null;
  }>;
  const datasetIds = datasetRows.map((dataset) => dataset.id);

  let submissionRows: RawSubmission[] = [];
  if (datasetIds.length > 0) {
    const { data: submissions, error: submissionError } = await supabase
      .from("submissions")
      .select(`
        status,
        created_at,
        dataset_request_id,
        dataset_requests:dataset_request_id (
          title
        )
      `)
      .in("dataset_request_id", datasetIds)
      .order("created_at", { ascending: false });

    if (submissionError) {
      return actionError("DB_ERROR", submissionError.message);
    }

    submissionRows = (submissions ?? []) as RawSubmission[];
  }

  const categoryBreakdown = datasetRows.reduce<Record<string, number>>((acc, dataset) => {
    const category = dataset.category ?? "other";
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 29);

  const timeseries = Array.from({ length: 30 }).map((_, index) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index);
    const key = date.toISOString().slice(0, 10);

    const submissionsForDay = submissionRows.filter((submission) =>
      submission.created_at?.startsWith(key)
    );

    return {
      date: key,
      submissions: submissionsForDay.length,
      approvals: submissionsForDay.filter((submission) => submission.status === "approved").length,
    };
  });

  return {
    timeseries,
    submissions: submissionRows.map((submission) => ({
      status: submission.status ?? "pending",
      dataset: {
        title: extractDatasetTitle(submission.dataset_requests) ?? "Dataset",
      },
      created_at: submission.created_at ?? null,
    })),
    datasets: datasetRows.map((dataset) => ({
      id: dataset.id,
      title: dataset.title,
      status: dataset.status ?? "draft",
    })),
    categoryBreakdown,
  };
}

export async function getRequesterOnboarding(): Promise<
  Array<{ id: string; label: string; status: "pending" | "in_progress" | "done"; completed_at: string | null }> | ActionError
> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data, error } = await supabase
    .from("requester_onboarding_progress")
    .select("steps,completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  const storedSteps = isRecord(data?.steps) ? data.steps : {};

  return ONBOARDING_ORDER.map((id) => {
    const stored = isRecord(storedSteps[id]) ? storedSteps[id] : {};
    const status = String(stored.status ?? DEFAULT_ONBOARDING_STATUS[id]) as OnboardingStepStatus;
    const normalizedStatus: OnboardingStepStatus = ["pending", "in_progress", "done"].includes(status)
      ? status
      : DEFAULT_ONBOARDING_STATUS[id];

    return {
      id,
      label: ONBOARDING_LABELS[id],
      status: normalizedStatus,
      completed_at:
        typeof stored.completed_at === "string" ? stored.completed_at : null,
    };
  });
}

export async function updateOnboardingStep(
  stepId: string,
  status: "pending" | "in_progress" | "done"
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    requesterOnboardingUpdateSchema,
    { stepId, status },
    "Invalid onboarding step update"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const normalizedStepId = validated.stepId as OnboardingStepId;

  const { data: existing, error: existingError } = await supabase
    .from("requester_onboarding_progress")
    .select("steps")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    return actionError("DB_ERROR", existingError.message);
  }

  const currentSteps = isRecord(existing?.steps) ? existing.steps : {};
  const nextSteps: Record<string, unknown> = { ...currentSteps };

  nextSteps[normalizedStepId] = {
    status: validated.status,
    completed_at: validated.status === "done" ? new Date().toISOString() : null,
  };

  const allDone = ONBOARDING_ORDER.every((id) => {
    const entry = isRecord(nextSteps[id]) ? nextSteps[id] : {};
    return entry.status === "done";
  });

  const { error } = await supabase.from("requester_onboarding_progress").upsert(
    {
      user_id: userId,
      steps: nextSteps,
      completed_at: allDone ? new Date().toISOString() : null,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  revalidatePath("/requester");
  revalidatePath("/requester/onboarding");

  return { ok: true };
}

export async function getDatasetTemplates(): Promise<
  Array<{ id: string; title: string; category?: string; data_type?: string; prompt?: string }> | ActionError
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dataset_templates")
    .select("id,title,category,data_type,prompt")
    .order("updated_at", { ascending: false });

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  return (data ?? []).map((template) => ({
    id: template.id,
    title: template.title,
    category: template.category ?? undefined,
    data_type: template.data_type ?? undefined,
    prompt: template.prompt ?? undefined,
  }));
}

export async function getRequesterDatasetDetail(
  id: string
): Promise<
  | {
      id: string;
      title: string;
      description?: string | null;
      category?: string | null;
      status?: string;
      approval_status?: string;
      reward_amount?: number;
      data_type?: string;
      currency?: string | null;
      deadline?: string | null;
      image_url?: string | null;
      quality_criteria?: string[];
      requirements?: string[];
      samples_collected?: number;
      samples_needed?: number;
      total_budget?: number | null;
      paid_amount?: number | null;
      pendingSubmissions?: number;
      latestExport?: { status?: string | null } | null;
      exports?: Array<{
        id: string;
        dataset_request_id: string;
        status: string;
        export_type: string;
        created_at: string;
        completed_at: string | null;
        size_bytes?: number | null;
        progress?: number | null;
        error?: string | null;
        expires_at?: string | null;
      }>;
      automation_config?: Record<string, unknown> | null;
      dataset?: {
        id: string;
        title: string;
        description?: string | null;
        category?: string | null;
        reward_amount?: number | null;
        data_type?: string | null;
        currency?: string | null;
        deadline?: string | null;
        image_url?: string | null;
        quality_criteria?: string[];
        requirements?: string[];
        samples_needed?: number | null;
        samples_collected?: number | null;
      };
    }
  | ActionError
> {
  const parsedInput = parseInput(
    requesterDatasetIdSchema,
    { id },
    "Invalid dataset id"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data, error } = await supabase
    .from("dataset_requests")
    .select(`
      id,
      title,
      description,
      category,
      status,
      approval_status,
      reward_amount,
      data_type,
      currency,
      deadline,
      image_url,
      quality_criteria,
      requirements,
      samples_collected,
      samples_needed,
      total_budget,
      paid_amount,
      automation_config,
      submissions(status)
    `)
    .eq("id", validated.id)
    .eq("created_by", userId)
    .single();

  if (error || !data) {
    return actionError("NOT_FOUND", "Dataset not found or access denied");
  }

  const submissions = Array.isArray(data.submissions)
    ? (data.submissions as RawSubmission[])
    : [];

  const { data: exportsData, error: exportsError } = await supabase
    .from("dataset_exports")
    .select("id,dataset_request_id,status,export_type,created_at,completed_at,size_bytes,progress,error,expires_at")
    .eq("dataset_request_id", data.id);

  if (exportsError && !isMissingTableError(exportsError, "dataset_exports")) {
    return actionError("DB_ERROR", exportsError.message);
  }

  const exports = (exportsData ?? []) as RawDatasetExport[];
  const latestExport = getLatestExport(exports);

  return {
    id: data.id,
    title: data.title,
    description: data.description ?? null,
    category: data.category ?? null,
    status: data.status,
    approval_status: data.approval_status,
    reward_amount: data.reward_amount ?? 0,
    data_type: data.data_type ?? "",
    currency: data.currency ?? "USD",
    deadline: data.deadline ?? null,
    image_url: data.image_url ?? null,
    quality_criteria: Array.isArray(data.quality_criteria)
      ? (data.quality_criteria as string[])
      : [],
    requirements: Array.isArray(data.requirements)
      ? (data.requirements as string[])
      : [],
    samples_collected: toNumber(data.samples_collected),
    samples_needed: toNumber(data.samples_needed),
    total_budget: data.total_budget ?? 0,
    paid_amount: data.paid_amount ?? 0,
    pendingSubmissions: getPendingSubmissionCount(submissions),
    latestExport: latestExport ? { status: latestExport.status } : null,
    exports: exports
      .sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .map((record) => ({
        id: record.id,
        dataset_request_id: record.dataset_request_id,
        status: record.status,
        export_type: record.export_type,
        created_at: record.created_at,
        completed_at: record.completed_at,
        size_bytes: record.size_bytes ?? null,
        progress: record.progress ?? null,
        error: record.error ?? null,
        expires_at: record.expires_at ?? null,
      })),
    automation_config: (isRecord(data.automation_config) ? data.automation_config : {}) as Record<string, unknown>,
    dataset: {
      id: data.id,
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? null,
      reward_amount: data.reward_amount ?? 0,
      data_type: data.data_type ?? "",
      currency: data.currency ?? "USD",
      deadline: data.deadline ?? null,
      image_url: data.image_url ?? null,
      quality_criteria: Array.isArray(data.quality_criteria)
        ? (data.quality_criteria as string[])
        : [],
      requirements: Array.isArray(data.requirements)
        ? (data.requirements as string[])
        : [],
      samples_needed: toNumber(data.samples_needed),
      samples_collected: toNumber(data.samples_collected),
    },
  };
}

export async function getRequesterBillingOverview(): Promise<
  | {
      wallet: {
        balance?: number;
        reserved?: number;
        available_balance?: number;
        pending_balance?: number;
      };
      history: Array<{ id: string; amount: number; type: string; created_at: string }>;
      invoices: Array<{ id: string; amount: number; status: string; issued_at: string }>;
      transactions: Array<{
        id: string;
        amount: number;
        type: string;
        status?: string;
        direction?: "debit" | "credit";
        currency?: string;
        reference_id?: string | null;
        dataset_request_id?: string | null;
        submission_id?: string | null;
        failure_reason?: string | null;
        metadata?: Record<string, unknown> | null;
        created_at: string;
      }>;
    }
  | ActionError
> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const [{ data: wallet, error: walletError }, { data: transactions, error: transactionsError }] =
    await Promise.all([
      supabase
        .from("wallets")
        .select("available_balance,pending_balance,currency")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select(
          "id,amount,type,status,direction,currency,reference_id,dataset_request_id,submission_id,metadata,created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (walletError) {
    return actionError("DB_ERROR", walletError.message);
  }
  if (transactionsError) {
    return actionError("DB_ERROR", transactionsError.message);
  }

  const availableBalanceCents = toNumber(wallet?.available_balance);
  const pendingBalanceCents = toNumber(wallet?.pending_balance);
  const normalizedTransactions = (transactions ?? []).map((tx) => {
    const normalizedStatus = ["pending", "completed", "failed", "cancelled"].includes(
      String(tx.status ?? "pending").toLowerCase()
    )
      ? String(tx.status ?? "pending").toLowerCase()
      : "pending";
    const normalizedDirection =
      tx.direction === "credit" || tx.direction === "debit"
        ? tx.direction
        : "debit";
    const failureReason = isRecord(tx.metadata)
      ? typeof tx.metadata.failure_reason === "string"
        ? tx.metadata.failure_reason
        : null
      : null;

    return {
      id: tx.id,
      amount: toNumber(tx.amount),
      type: tx.type,
      status: normalizedStatus,
      direction: normalizedDirection,
      currency: tx.currency ?? "usd",
      reference_id: tx.reference_id ?? null,
      dataset_request_id: tx.dataset_request_id ?? null,
      submission_id: tx.submission_id ?? null,
      failure_reason: failureReason,
      metadata: isRecord(tx.metadata) ? tx.metadata : null,
      created_at: tx.created_at,
    };
  });

  return {
    wallet: {
      // `balance` and `reserved` remain for backward compatibility; values are cents.
      balance: availableBalanceCents + pendingBalanceCents,
      reserved: pendingBalanceCents,
      available_balance: availableBalanceCents,
      pending_balance: pendingBalanceCents,
    },
    history: normalizedTransactions.slice(0, 20).map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      type: tx.type,
      created_at: tx.created_at,
    })),
    invoices: [],
    transactions: normalizedTransactions,
  };
}

function toCsvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
}

export async function exportRequesterBillingLedgerCsv(): Promise<
  | {
      data: {
        filename: string;
        content: string;
      };
    }
  | ActionError
> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select(
      "id,created_at,type,status,direction,amount,currency,dataset_request_id,submission_id,reference_id,metadata"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  const header = [
    "id",
    "created_at",
    "type",
    "status",
    "direction",
    "amount_cents",
    "amount_currency",
    "amount_decimal",
    "dataset_request_id",
    "submission_id",
    "reference_id",
    "failure_reason",
  ];

  const lines = (transactions ?? []).map((tx) => {
    const failureReason = isRecord(tx.metadata)
      ? typeof tx.metadata.failure_reason === "string"
        ? tx.metadata.failure_reason
        : ""
      : "";

    const amountCents = toNumber(tx.amount);
    const amountDecimal = (amountCents / 100).toFixed(2);

    return [
      tx.id,
      tx.created_at,
      tx.type ?? "",
      tx.status ?? "",
      tx.direction ?? "",
      amountCents,
      String(tx.currency ?? "usd").toUpperCase(),
      amountDecimal,
      tx.dataset_request_id ?? "",
      tx.submission_id ?? "",
      tx.reference_id ?? "",
      failureReason,
    ]
      .map((cell) => toCsvCell(cell))
      .join(",");
  });

  const content = [header.map(toCsvCell).join(","), ...lines].join("\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return {
    data: {
      filename: `requester-ledger-${stamp}.csv`,
      content,
    },
  };
}

export async function getOrgSettings(): Promise<{
  company_name: string | null;
  contact_email: string | null;
  tax_id: string | null;
  billing_address?: string | null;
  default_currency: string | null;
}> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return {
      company_name: null,
      contact_email: null,
      tax_id: null,
      billing_address: null,
      default_currency: "USD",
    };
  }

  const { supabase, userId } = auth;

  const { data } = await supabase
    .from("requester_org_settings")
    .select("company_name,contact_email,tax_id,billing_address,default_currency")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return {
      company_name: null,
      contact_email: null,
      tax_id: null,
      billing_address: null,
      default_currency: "USD",
    };
  }

  return {
    company_name: data.company_name ?? null,
    contact_email: data.contact_email ?? null,
    tax_id: data.tax_id ?? null,
    billing_address: data.billing_address
      ? JSON.stringify(data.billing_address)
      : null,
    default_currency: data.default_currency ?? "USD",
  };
}

export async function saveOrgSettings(
  input: Record<string, unknown>
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    requesterOrgSettingsSchema,
    input,
    "Invalid organization settings payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const companyName =
    typeof validated.company_name === "string"
      ? validated.company_name.trim()
      : null;
  const contactEmail =
    typeof validated.contact_email === "string"
      ? validated.contact_email.trim()
      : null;
  const taxId =
    typeof validated.tax_id === "string" ? validated.tax_id.trim() : null;
  const defaultCurrency =
    typeof validated.default_currency === "string"
      ? validated.default_currency.trim().toUpperCase()
      : "USD";

  const { error } = await supabase.from("requester_org_settings").upsert(
    {
      user_id: userId,
      company_name: companyName || null,
      contact_email: contactEmail || null,
      tax_id: taxId || null,
      default_currency: defaultCurrency || "USD",
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  revalidatePath("/requester/settings");

  return { ok: true };
}

export async function getRequesterApiKeys(): Promise<
  | Array<{
      id: string;
      name: string | null;
      created_at: string;
      revoked_at: string | null;
      last_used_at?: string | null;
    }>
  | ActionError
> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("requester_api_keys")
    .select("id,name,created_at,revoked_at,last_used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  return (data ?? []).map((key) => ({
    id: key.id,
    name: key.name ?? null,
    created_at: key.created_at,
    revoked_at: key.revoked_at ?? null,
    last_used_at: key.last_used_at ?? null,
  }));
}

export async function generateRequesterApiKey(
  label?: string
): Promise<{ data: { apiKey: string } } | ActionError> {
  const parsedInput = parseInput(
    requesterApiKeyGenerateSchema,
    { label },
    "Invalid API key label"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const token = `req_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  const name = (validated.label ?? "Integration").trim().slice(0, 120);

  const { error } = await supabase.from("requester_api_keys").insert({
    user_id: userId,
    key_hash: hash,
    name: name || "Integration",
    scopes: ["datasets:read", "exports:read"],
  });

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  revalidatePath("/requester/settings");

  return { data: { apiKey: token } };
}

export async function revokeRequesterApiKey(
  id: string
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    requesterApiKeyRevokeSchema,
    { id },
    "Invalid API key id"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const { error } = await supabase
    .from("requester_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", validated.id)
    .eq("user_id", userId);

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  revalidatePath("/requester/settings");

  return { ok: true };
}

export async function getSupportTickets(): Promise<
  Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    last_message_preview: string | null;
  }> | ActionError
> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id,subject,status,priority,created_at,updated_at,messages")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return actionError("DB_ERROR", error.message);
  }

  return (data ?? []).map((ticket) => {
    const messages = parseSupportMessages(ticket.messages);
    return {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority ?? "normal",
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      message_count: messages.length,
      last_message_preview: messages.at(-1)?.body.slice(0, 140) ?? null,
    };
  });
}

export async function createSupportTicket(
  input: Record<string, unknown>
): Promise<{ ok: true; id: string } | ActionError> {
  const parsedInput = parseInput(
    requesterSupportTicketSchema,
    input,
    "Invalid support ticket payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const subject = validated.subject.trim();
  const description = (validated.description ?? "").trim();
  const now = new Date().toISOString();
  const messages = description
    ? [
        {
          id: randomUUID(),
          role: "requester",
          body: description,
          created_at: now,
        },
      ]
    : [];

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: userId,
      subject,
      description: description || null,
      status: "open",
      priority: "normal",
      messages,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data) {
    return actionError("DB_ERROR", error?.message ?? "Failed to create support ticket");
  }

  revalidatePath("/requester/support");

  return { ok: true, id: data.id };
}

export async function getSupportTicketDetail(
  ticketId: string
): Promise<
  | {
      id: string;
      subject: string;
      description: string | null;
      status: string;
      priority: string;
      created_at: string;
      updated_at: string;
      resolved_at: string | null;
      messages: SupportTicketMessage[];
    }
  | ActionError
> {
  const parsedInput = parseInput(
    requesterSupportTicketIdSchema,
    { ticketId },
    "Invalid support ticket id"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id,subject,description,status,priority,created_at,updated_at,resolved_at,messages")
    .eq("id", parsedInput.data.ticketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return actionError("DB_ERROR", error.message);
  }
  if (!data) {
    return actionError("NOT_FOUND", "Support ticket not found");
  }

  return {
    id: data.id,
    subject: data.subject,
    description: data.description ?? null,
    status: data.status,
    priority: data.priority ?? "normal",
    created_at: data.created_at,
    updated_at: data.updated_at,
    resolved_at: data.resolved_at ?? null,
    messages: parseSupportMessages(data.messages),
  };
}

export async function addSupportTicketReply(
  input: Record<string, unknown>
): Promise<{ ok: true } | ActionError> {
  const parsedInput = parseInput(
    requesterSupportTicketReplySchema,
    input,
    "Invalid support reply payload"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }
  const validated = parsedInput.data;

  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;
  const { data: ticket, error: fetchError } = await supabase
    .from("support_tickets")
    .select("id,status,resolved_at,messages")
    .eq("id", validated.ticketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    return actionError("DB_ERROR", fetchError.message);
  }
  if (!ticket) {
    return actionError("NOT_FOUND", "Support ticket not found");
  }

  const nextMessages = parseSupportMessages(ticket.messages);
  nextMessages.push({
    id: randomUUID(),
    role: "requester",
    body: validated.body.trim(),
    created_at: new Date().toISOString(),
  });

  const nextStatus =
    validated.status ??
    (ticket.status === "closed" || ticket.status === "resolved"
      ? "open"
      : ticket.status);

  const resolvedAt =
    nextStatus === "resolved" || nextStatus === "closed"
      ? ticket.resolved_at ?? new Date().toISOString()
      : null;

  const { error: updateError } = await supabase
    .from("support_tickets")
    .update({
      status: nextStatus,
      messages: nextMessages,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", validated.ticketId)
    .eq("user_id", userId);

  if (updateError) {
    return actionError("DB_ERROR", updateError.message);
  }

  revalidatePath("/requester/support");
  revalidatePath(`/requester/support/${validated.ticketId}`);

  return { ok: true };
}

export async function getRequesterDashboardData(): Promise<
  | {
      stats: {
        datasetCounts: Record<string, number>;
        submissions: { pending: number; approved: number; rejected: number; needsChanges: number };
        funding: { totalBudget: number; totalFunded: number; totalSpent: number; walletBalance: number };
        exports: { ready: number; processing: number };
        pendingActions: Array<{ id: string; title: string; type: "review" | "funding" | "deadline"; dueAt?: string | null }>;
      };
      chart: Array<{ date: string; submissions: number; approvals: number }>;
      onboarding: Array<{ id: string; label: string; status: "pending" | "in_progress" | "done"; completed_at: string | null }>;
      notifications: Array<{
        id: string;
        type: "review_backlog" | "low_budget" | "export_ready";
        severity: "info" | "warning" | "critical";
        datasetTitle?: string | null;
        pendingCount?: number;
        fundedPercentage?: number;
        exportId?: string;
      }>;
    }
  | ActionError
> {
  const auth = await getRequesterAuthContext();
  if ("error" in auth) {
    return auth;
  }

  const { supabase, userId } = auth;

  const { data: datasets, error: datasetsError } = await supabase
    .from("dataset_requests")
    .select(`
      id,
      title,
      status,
      deadline,
      reward_amount,
      samples_collected,
      total_budget,
      paid_amount,
      created_at
    `)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (datasetsError) {
    return actionError("DB_ERROR", datasetsError.message);
  }

  const datasetRows = (datasets ?? []) as Array<{
    id: string;
    title: string;
    status?: string | null;
    deadline?: string | null;
    reward_amount?: number | null;
    samples_collected?: number | null;
    total_budget?: number | null;
    paid_amount?: number | null;
    created_at?: string | null;
  }>;
  const datasetIds = datasetRows.map((dataset) => dataset.id);

  let submissions: RawSubmission[] = [];
  let exports: RawDatasetExport[] = [];

  if (datasetIds.length > 0) {
    const [submissionsRes, exportsRes] = await Promise.all([
      supabase
        .from("submissions")
        .select(`
          status,
          created_at,
          dataset_request_id,
          dataset_requests:dataset_request_id ( title )
        `)
        .in("dataset_request_id", datasetIds),
      supabase
        .from("dataset_exports")
        .select("id,dataset_request_id,status,export_type,created_at,completed_at")
        .in("dataset_request_id", datasetIds),
    ]);

    if (submissionsRes.error) {
      return actionError("DB_ERROR", submissionsRes.error.message);
    }
    if (exportsRes.error && !isMissingTableError(exportsRes.error, "dataset_exports")) {
      return actionError("DB_ERROR", exportsRes.error.message);
    }

    submissions = (submissionsRes.data ?? []) as RawSubmission[];
    exports = (exportsRes.data ?? []) as RawDatasetExport[];
  }

  const onboarding = await getRequesterOnboarding();
  const onboardingSteps = Array.isArray(onboarding) ? onboarding : [];

  const { data: wallet } = await supabase
    .from("wallets")
    .select("available_balance")
    .eq("user_id", userId)
    .maybeSingle();

  const datasetCounts = datasetRows.reduce<Record<string, number>>((acc, row) => {
    const key = row.status ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const submissionsByStatus = submissions.reduce(
    (acc, submission) => {
      if (submission.status === "approved") acc.approved += 1;
      else if (submission.status === "rejected") acc.rejected += 1;
      else if (submission.status === "needs_changes") acc.needsChanges += 1;
      else acc.pending += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0, needsChanges: 0 }
  );

  const funding = datasetRows.reduce(
    (acc, row) => {
      const budget = toNumber(row.total_budget);
      const funded = toNumber(row.paid_amount);
      const spent = toNumber(row.reward_amount) * toNumber(row.samples_collected);

      acc.totalBudget += budget;
      acc.totalFunded += funded;
      acc.totalSpent += spent;

      return acc;
    },
    { totalBudget: 0, totalFunded: 0, totalSpent: 0, walletBalance: 0 }
  );

  funding.walletBalance = dollarsFromCents(wallet?.available_balance);

  const exportStats = exports.reduce(
    (acc, record) => {
      if (record.status === "ready") acc.ready += 1;
      if (record.status === "pending" || record.status === "preparing") acc.processing += 1;
      return acc;
    },
    { ready: 0, processing: 0 }
  );

  const pendingPerDataset = submissions.reduce<Record<string, number>>((acc, submission) => {
    if (submission.status === "pending" || submission.status === "needs_changes") {
      const datasetId = submission.dataset_request_id ?? "";
      if (datasetId) {
        acc[datasetId] = (acc[datasetId] ?? 0) + 1;
      }
    }
    return acc;
  }, {});

  const pendingActions: Array<{
    id: string;
    title: string;
    type: "review" | "funding" | "deadline";
    dueAt?: string | null;
  }> = [];

  const notifications: Array<{
    id: string;
    type: "review_backlog" | "low_budget" | "export_ready";
    severity: "info" | "warning" | "critical";
    datasetTitle?: string | null;
    pendingCount?: number;
    fundedPercentage?: number;
    exportId?: string;
  }> = [];

  for (const dataset of datasetRows) {
    const pendingCount = pendingPerDataset[dataset.id] ?? 0;
    const totalBudget = toNumber(dataset.total_budget);
    const totalFunded = toNumber(dataset.paid_amount);
    const fundedPercentage = totalBudget > 0 ? Math.round((totalFunded / totalBudget) * 100) : 100;
    const deadline = dataset.deadline ? new Date(dataset.deadline) : null;
    const daysToDeadline = deadline
      ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    if (pendingCount > 0) {
      pendingActions.push({
        id: dataset.id,
        title: `${dataset.title} has ${pendingCount} pending review${pendingCount > 1 ? "s" : ""}`,
        type: "review",
      });

      notifications.push({
        id: `review-${dataset.id}`,
        type: "review_backlog",
        severity: pendingCount >= 10 ? "critical" : "warning",
        datasetTitle: dataset.title,
        pendingCount,
      });
    }

    if ((dataset.status ?? "") === "active" && fundedPercentage < 60) {
      pendingActions.push({
        id: dataset.id,
        title: `${dataset.title} is only ${fundedPercentage}% funded`,
        type: "funding",
      });

      notifications.push({
        id: `funding-${dataset.id}`,
        type: "low_budget",
        severity: fundedPercentage < 30 ? "critical" : "warning",
        datasetTitle: dataset.title,
        fundedPercentage,
      });
    }

    if (
      (dataset.status ?? "") === "active" &&
      typeof daysToDeadline === "number" &&
      daysToDeadline >= 0 &&
      daysToDeadline <= 7
    ) {
      pendingActions.push({
        id: dataset.id,
        title: `${dataset.title} closes soon`,
        type: "deadline",
        dueAt: deadline?.toISOString() ?? null,
      });
    }
  }

  exports
    .filter((record) => record.status === "ready")
    .slice(0, 5)
    .forEach((record) => {
      const dataset = datasetRows.find((item) => item.id === record.dataset_request_id);
      notifications.push({
        id: `export-${record.id}`,
        type: "export_ready",
        severity: "info",
        datasetTitle: dataset?.title ?? "Dataset",
        exportId: record.id,
      });
    });

  const seriesStart = new Date();
  seriesStart.setDate(seriesStart.getDate() - 29);

  const chart = Array.from({ length: 30 }).map((_, idx) => {
    const date = new Date(seriesStart);
    date.setDate(date.getDate() + idx);
    const key = date.toISOString().slice(0, 10);
    const onDate = submissions.filter((submission) =>
      submission.created_at?.startsWith(key)
    );

    return {
      date: key,
      submissions: onDate.length,
      approvals: onDate.filter((submission) => submission.status === "approved").length,
    };
  });

  return {
    stats: {
      datasetCounts,
      submissions: submissionsByStatus,
      funding,
      exports: exportStats,
      pendingActions: pendingActions.slice(0, 8),
    },
    chart,
    onboarding: onboardingSteps,
    notifications: notifications.slice(0, 10),
  };
}
