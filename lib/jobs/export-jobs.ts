import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { spacesClient, SPACES_BUCKET, CDN_URL } from "@/lib/storage/spaces-client";

type ExportJobRow = {
  id: string;
  dataset_request_id: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ExportDatasetRow = {
  id: string;
  title: string;
};

type ExportSubmissionRow = {
  id: string;
  file_urls: string[] | null;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
};

export type ExportJobProcessResult = {
  exportId: string;
  status: "processed" | "failed" | "skipped";
  reason?: string;
};

export type ExportJobBatchSummary = {
  queued: number;
  claimed: number;
  processed: number;
  failed: number;
  skipped: number;
  results: ExportJobProcessResult[];
};

const MAX_BATCH_SIZE = 25;

function clampBatchSize(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 5;
  }
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value ?? 5)));
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
) {
  return {
    ...(existing ?? {}),
    ...patch,
  };
}

function getContributorName(submission: ExportSubmissionRow) {
  if (Array.isArray(submission.profiles)) {
    return submission.profiles[0]?.full_name || "Anonymous";
  }
  return submission.profiles?.full_name || "Anonymous";
}

function resolveExportFileUrl(objectKey: string) {
  const normalizedKey = objectKey.replace(/^\//, "");
  const cdnBase = (CDN_URL || "").replace(/\/$/, "");
  if (cdnBase) {
    return `${cdnBase}/${normalizedKey}`;
  }

  const endpoint = (process.env.DO_SPACES_ENDPOINT || "").replace(/\/$/, "");
  if (!endpoint || !SPACES_BUCKET) {
    return null;
  }

  return `${endpoint}/${SPACES_BUCKET}/${normalizedKey}`;
}

async function failDatasetExportJob(
  adminClient: any,
  row: ExportJobRow,
  stage: string,
  reason: string
) {
  const errorMessage = reason.slice(0, 500);
  const metadata = mergeMetadata(row.metadata, {
    job_failed_at: new Date().toISOString(),
    job_failure_stage: stage,
  });

  await adminClient
    .from("dataset_exports")
    .update({
      status: "failed",
      progress: 0,
      error: errorMessage,
      completed_at: null,
      metadata,
    })
    .eq("id", row.id);
}

async function buildDatasetExportPayload(
  adminClient: any,
  datasetId: string
): Promise<{ json: string; submittedAt: string }> {
  const submittedAt = new Date().toISOString();
  const { data: dataset, error: datasetError } = await adminClient
    .from("dataset_requests")
    .select("id,title")
    .eq("id", datasetId)
    .maybeSingle();

  if (datasetError || !dataset) {
    throw new Error(datasetError?.message ?? "Dataset not found for export job");
  }

  const { data: submissions, error: submissionsError } = await adminClient
    .from("submissions")
    .select(`
      id,
      file_urls,
      metadata,
      notes,
      created_at,
      profiles:contributor_id (
        full_name
      )
    `)
    .eq("dataset_request_id", datasetId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (submissionsError) {
    throw new Error(submissionsError.message);
  }

  const datasetRow = dataset as ExportDatasetRow;
  const submissionRows = (submissions ?? []) as ExportSubmissionRow[];
  const payload = {
    dataset: {
      id: datasetRow.id,
      title: datasetRow.title,
    },
    export_date: submittedAt,
    submissions: submissionRows.map((submission) => ({
      id: submission.id,
      contributor: getContributorName(submission),
      file_urls: Array.isArray(submission.file_urls) ? submission.file_urls : [],
      metadata: toRecord(submission.metadata),
      notes: submission.notes,
      created_at: submission.created_at,
    })),
  };

  return {
    json: JSON.stringify(payload, null, 2),
    submittedAt,
  };
}

async function claimDatasetExportJob(
  adminClient: any,
  row: ExportJobRow
): Promise<ExportJobRow | null> {
  const metadata = mergeMetadata(row.metadata, {
    job_claimed_at: new Date().toISOString(),
    job_attempt:
      typeof row.metadata?.job_attempt === "number"
        ? Number(row.metadata.job_attempt) + 1
        : 1,
  });

  const { data, error } = await adminClient
    .from("dataset_exports")
    .update({
      status: "preparing",
      progress: 10,
      error: null,
      metadata,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id,dataset_request_id,status,metadata,created_at")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return data as ExportJobRow;
}

async function processDatasetExportJob(
  adminClient: any,
  row: ExportJobRow
): Promise<ExportJobProcessResult> {
  const claimed = await claimDatasetExportJob(adminClient, row);
  if (!claimed) {
    return {
      exportId: row.id,
      status: "skipped",
      reason: "Export job was already claimed by another worker",
    };
  }

  try {
    const payload = await buildDatasetExportPayload(adminClient, row.dataset_request_id);
    const objectKey = `exports/${row.dataset_request_id}/${row.id}.json`;
    const body = Buffer.from(payload.json, "utf8");

    await adminClient
      .from("dataset_exports")
      .update({ progress: 65 })
      .eq("id", row.id);

    await spacesClient.send(
      new PutObjectCommand({
        Bucket: SPACES_BUCKET,
        Key: objectKey,
        Body: body,
        ACL: "public-read",
        ContentType: "application/json",
        CacheControl: "max-age=300",
      })
    );

    const fileUrl = resolveExportFileUrl(objectKey);
    if (!fileUrl) {
      throw new Error("Unable to generate export download URL");
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const metadata = mergeMetadata(claimed.metadata, {
      requested_at:
        typeof claimed.metadata?.requested_at === "string"
          ? claimed.metadata.requested_at
          : payload.submittedAt,
      format: "json",
      object_key: objectKey,
      job_completed_at: now.toISOString(),
    });

    const { error: readyError } = await adminClient
      .from("dataset_exports")
      .update({
        status: "ready",
        progress: 100,
        file_url: fileUrl,
        size_bytes: body.length,
        completed_at: now.toISOString(),
        expires_at: expiresAt,
        metadata,
      })
      .eq("id", row.id);

    if (readyError) {
      throw new Error(readyError.message);
    }

    return {
      exportId: row.id,
      status: "processed",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown export processing error";
    await failDatasetExportJob(adminClient, claimed, "processing", reason);
    return {
      exportId: row.id,
      status: "failed",
      reason,
    };
  }
}

export async function processPendingDatasetExportJobs(input?: {
  limit?: number;
  exportId?: string;
}): Promise<ExportJobBatchSummary> {
  const admin = createAdminClient("export_jobs");
  const adminClient = admin as any;

  const results: ExportJobProcessResult[] = [];

  if (input?.exportId) {
    const { data: singleJob, error: singleJobError } = await adminClient
      .from("dataset_exports")
      .select("id,dataset_request_id,status,metadata,created_at")
      .eq("id", input.exportId)
      .eq("status", "pending")
      .maybeSingle();

    if (singleJobError) {
      throw new Error(singleJobError.message);
    }

    if (!singleJob) {
      return {
        queued: 0,
        claimed: 0,
        processed: 0,
        failed: 0,
        skipped: 1,
        results: [
          {
            exportId: input.exportId,
            status: "skipped",
            reason: "No pending export job found for id",
          },
        ],
      };
    }

    const result = await processDatasetExportJob(adminClient, singleJob as ExportJobRow);
    results.push(result);
    return {
      queued: 1,
      claimed: result.status === "skipped" ? 0 : 1,
      processed: result.status === "processed" ? 1 : 0,
      failed: result.status === "failed" ? 1 : 0,
      skipped: result.status === "skipped" ? 1 : 0,
      results,
    };
  }

  const limit = clampBatchSize(input?.limit);
  const { data: pendingRows, error: pendingError } = await adminClient
    .from("dataset_exports")
    .select("id,dataset_request_id,status,metadata,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (pendingError) {
    throw new Error(pendingError.message);
  }

  const rows = (pendingRows ?? []) as ExportJobRow[];
  for (const row of rows) {
    const result = await processDatasetExportJob(adminClient, row);
    results.push(result);
  }

  return {
    queued: rows.length,
    claimed: results.filter((result) => result.status !== "skipped").length,
    processed: results.filter((result) => result.status === "processed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    results,
  };
}
