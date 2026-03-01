import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  type _Object,
} from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { spacesClient, SPACES_BUCKET, CDN_URL } from "@/lib/storage/spaces-client";

type ExportRow = {
  id: string;
  status: string;
  file_url: string | null;
  metadata: Record<string, unknown> | null;
  expires_at: string | null;
  updated_at: string | null;
};

const DELETE_AFTER_DAYS = Number(process.env.EXPORT_RETENTION_DELETE_AFTER_DAYS ?? "30");
const TEMP_RETENTION_DAYS = Number(process.env.TEMP_ARTIFACT_RETENTION_DAYS ?? "2");
const DRY_RUN = process.env.RETENTION_DRY_RUN === "true";
const TEMP_PREFIXES = (
  process.env.RETENTION_TEMP_PREFIXES ??
  "dataset-files/temp/,dataset-images/temp/"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function parseIso(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function getObjectKeyFromExport(row: ExportRow) {
  const metadata = row.metadata ?? {};
  const keyFromMetadata =
    typeof metadata.object_key === "string" ? metadata.object_key : "";
  if (keyFromMetadata) {
    return keyFromMetadata.replace(/^\//, "");
  }

  const fileUrl = row.file_url ?? "";
  if (!fileUrl) {
    return null;
  }

  if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
    return fileUrl.replace(/^\//, "");
  }

  const cdnBase = (CDN_URL || "").replace(/\/$/, "");
  if (cdnBase && fileUrl.startsWith(cdnBase)) {
    return fileUrl.slice(cdnBase.length).replace(/^\//, "");
  }

  const endpoint = (process.env.DO_SPACES_ENDPOINT || "").replace(/\/$/, "");
  const bucketPrefix = endpoint ? `${endpoint}/${SPACES_BUCKET}/` : "";
  if (bucketPrefix && fileUrl.startsWith(bucketPrefix)) {
    return fileUrl.slice(bucketPrefix.length).replace(/^\//, "");
  }

  return null;
}

function buildRetentionMetadata(
  existing: Record<string, unknown> | null,
  patch: Record<string, unknown>
) {
  return {
    ...(existing ?? {}),
    retention: {
      ...(typeof existing?.retention === "object" && existing.retention
        ? (existing.retention as Record<string, unknown>)
        : {}),
      ...patch,
    },
  };
}

async function deleteObjectIfPresent(key: string, reason: string) {
  if (!key) {
    return;
  }

  if (DRY_RUN) {
    console.info(`[retention][dry-run] delete ${key} (${reason})`);
    return;
  }

  await spacesClient.send(
    new DeleteObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: key,
    })
  );
}

async function cleanupDatasetExports() {
  const admin = createAdminClient("retention_jobs");
  const adminClient = admin as any;

  const now = new Date();
  const deleteCutoff = new Date(now);
  deleteCutoff.setDate(now.getDate() - DELETE_AFTER_DAYS);

  const { data, error } = await adminClient
    .from("dataset_exports")
    .select("id,status,file_url,metadata,expires_at,updated_at")
    .in("status", ["ready", "expired", "failed", "cancelled"])
    .order("updated_at", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load dataset exports: ${error.message}`);
  }

  const rows = (data ?? []) as ExportRow[];
  let markedExpired = 0;
  let purged = 0;

  for (const row of rows) {
    const expiresAt = parseIso(row.expires_at);
    const updatedAt = parseIso(row.updated_at) ?? new Date(0);
    const isExpiredReady = row.status === "ready" && !!expiresAt && expiresAt < now;
    const shouldPurgeArtifact =
      (row.status === "expired" || row.status === "failed" || row.status === "cancelled") &&
      updatedAt < deleteCutoff;

    if (!isExpiredReady && !shouldPurgeArtifact) {
      continue;
    }

    const objectKey = getObjectKeyFromExport(row);
    if (objectKey) {
      await deleteObjectIfPresent(objectKey, isExpiredReady ? "mark-expired" : "purge");
    }

    const metadata = buildRetentionMetadata(row.metadata, {
      last_cleanup_at: now.toISOString(),
      object_deleted: Boolean(objectKey),
      dry_run: DRY_RUN,
    });

    if (isExpiredReady) {
      if (!DRY_RUN) {
        await adminClient
          .from("dataset_exports")
          .update({
            status: "expired",
            file_url: null,
            size_bytes: null,
            checksum: null,
            error: "Export expired and artifact removed by retention job.",
            metadata,
            updated_at: now.toISOString(),
          })
          .eq("id", row.id);
      }
      markedExpired += 1;
      continue;
    }

    if (!DRY_RUN) {
      await adminClient
        .from("dataset_exports")
        .update({
          file_url: null,
          size_bytes: null,
          checksum: null,
          metadata,
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);
    }
    purged += 1;
  }

  return { scanned: rows.length, markedExpired, purged };
}

async function deleteOldTempObjects(prefix: string, cutoff: Date) {
  let continuationToken: string | undefined;
  let deletedCount = 0;
  let scannedCount = 0;

  while (true) {
    const page = await spacesClient.send(
      new ListObjectsV2Command({
        Bucket: SPACES_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const objects = (page.Contents ?? []) as _Object[];

    for (const object of objects) {
      scannedCount += 1;
      if (!object.Key || !object.LastModified) {
        continue;
      }
      if (object.LastModified >= cutoff) {
        continue;
      }
      await deleteObjectIfPresent(object.Key, `temp-prefix:${prefix}`);
      deletedCount += 1;
    }

    if (!page.IsTruncated || !page.NextContinuationToken) {
      break;
    }
    continuationToken = page.NextContinuationToken;
  }

  return { prefix, scanned: scannedCount, deleted: deletedCount };
}

async function cleanupTempArtifacts() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TEMP_RETENTION_DAYS);

  const results = [];
  for (const prefix of TEMP_PREFIXES) {
    const result = await deleteOldTempObjects(prefix, cutoff);
    results.push(result);
  }
  return results;
}

async function main() {
  const exportResult = await cleanupDatasetExports();
  const tempResults = await cleanupTempArtifacts();

  console.info(
    JSON.stringify(
      {
        job: "cleanup-expired-artifacts",
        dryRun: DRY_RUN,
        exportResult,
        tempResults,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("cleanup-expired-artifacts failed", error);
  process.exit(1);
});
