import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { spacesClient, SPACES_BUCKET, CDN_URL } from "@/lib/storage/spaces-client";
import { logError } from "@/lib/security/structured-logger";

const SAFE_BUCKET_PATTERN = /^[a-z0-9-]+$/;
const SAFE_PATH_PATTERN = /^[a-zA-Z0-9/_\-.]+$/;
const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9-]{1,80}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_BUCKETS = new Set(["dataset-files", "dataset-images"]);

const UPLOAD_LIMITS_BYTES: Record<string, number> = {
  "dataset-files": 50 * 1024 * 1024,
  "dataset-images": 8 * 1024 * 1024,
};

const DATASET_FILE_EXACT_MIME = new Set([
  "application/pdf",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "text/plain": "txt",
  "application/pdf": "pdf",
  "application/json": "json",
};

type UserRole = "requester" | "contributor" | "admin";

function isAllowedBucket(bucket: string) {
  return SAFE_BUCKET_PATTERN.test(bucket) && ALLOWED_BUCKETS.has(bucket);
}

function isSafePath(path: string) {
  if (!path || path.length > 300) return false;
  if (!SAFE_PATH_PATTERN.test(path)) return false;
  if (path.includes("..")) return false;
  if (path.startsWith("/")) return false;
  return true;
}

function getSanitizedExtension(file: File) {
  const fromName = file.name
    .split(".")
    .pop()
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (fromName && fromName.length <= 12) {
    return fromName;
  }

  return MIME_TO_EXTENSION[file.type] ?? "bin";
}

function isAllowedMime(bucket: string, mimeType: string) {
  if (!mimeType) return false;

  if (bucket === "dataset-images") {
    return mimeType.startsWith("image/");
  }

  if (bucket === "dataset-files") {
    if (
      mimeType.startsWith("image/") ||
      mimeType.startsWith("video/") ||
      mimeType.startsWith("audio/") ||
      mimeType.startsWith("text/")
    ) {
      return true;
    }

    return DATASET_FILE_EXACT_MIME.has(mimeType);
  }

  return false;
}

function pathBelongsToUser(path: string, userId: string) {
  return path.startsWith(`${userId}/`) || path.includes(`/${userId}/`);
}

async function getUserRole(userId: string): Promise<UserRole | null> {
  const admin = createAdminClient("file_uploads");
  const adminClient = admin as any;

  const { data, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.role) {
    if (error) {
      logError("upload.resolve_role_failed", { error, userId });
    }
    return null;
  }

  return data.role as UserRole;
}

async function canUploadToDataset(
  role: UserRole,
  userId: string,
  bucket: string,
  datasetId: string
) {
  const admin = createAdminClient("file_uploads");
  const adminClient = admin as any;

  const { data: dataset, error } = await adminClient
    .from("dataset_requests")
    .select("id, created_by, status, approval_status")
    .eq("id", datasetId)
    .maybeSingle();

  if (error || !dataset) {
    if (error) {
      logError("upload.dataset_access_lookup_failed", {
        error,
        userId,
        datasetId,
        role,
      });
    }
    return false;
  }

  if (role === "admin") {
    return true;
  }

  if (bucket === "dataset-images") {
    return role === "requester" && dataset.created_by === userId;
  }

  if (bucket === "dataset-files") {
    if (role !== "contributor") return false;
    if (dataset.approval_status !== "approved") return false;
    return dataset.status === "active" || dataset.status === "closing-soon";
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const fileValue = formData.get("file");
    const bucketValue = formData.get("bucket");
    const datasetIdValue = formData.get("datasetId");

    const file = fileValue instanceof File ? fileValue : null;
    const bucket = typeof bucketValue === "string" ? bucketValue.trim() : "";
    const datasetId =
      typeof datasetIdValue === "string" && datasetIdValue.trim().length > 0
        ? datasetIdValue.trim()
        : null;

    if (!file || !bucket) {
      return NextResponse.json(
        { error: "Missing file or bucket parameter" },
        { status: 400 }
      );
    }

    if (!isAllowedBucket(bucket)) {
      return NextResponse.json(
        { error: "Bucket is not allowed" },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    if (file.size > UPLOAD_LIMITS_BYTES[bucket]) {
      return NextResponse.json(
        {
          error: `File exceeds max size for ${bucket}`,
          maxBytes: UPLOAD_LIMITS_BYTES[bucket],
        },
        { status: 413 }
      );
    }

    if (!isAllowedMime(bucket, file.type)) {
      return NextResponse.json(
        { error: "File type is not allowed for this bucket" },
        { status: 415 }
      );
    }

    const userRole = await getUserRole(user.id);
    if (!userRole) {
      return NextResponse.json({ error: "Unable to resolve user role" }, { status: 403 });
    }

    if (bucket === "dataset-images" && !["admin", "requester"].includes(userRole)) {
      return NextResponse.json(
        { error: "You do not have permission to upload dataset images" },
        { status: 403 }
      );
    }

    if (bucket === "dataset-files" && !["admin", "contributor"].includes(userRole)) {
      return NextResponse.json(
        { error: "You do not have permission to upload dataset files" },
        { status: 403 }
      );
    }

    if (bucket === "dataset-files") {
      if (!datasetId) {
        return NextResponse.json(
          { error: "datasetId is required for dataset file uploads" },
          { status: 400 }
        );
      }

      if (!UUID_PATTERN.test(datasetId)) {
        return NextResponse.json(
          { error: "Invalid datasetId format" },
          { status: 400 }
        );
      }

      const hasAccess = await canUploadToDataset(userRole, user.id, bucket, datasetId);
      if (!hasAccess) {
        return NextResponse.json(
          { error: "You do not have access to upload to this dataset" },
          { status: 403 }
        );
      }
    }

    if (bucket === "dataset-images") {
      if (userRole === "requester") {
        if (!datasetId || !UUID_PATTERN.test(datasetId)) {
          return NextResponse.json(
            { error: "A valid datasetId is required for requester image uploads" },
            { status: 400 }
          );
        }

        const hasAccess = await canUploadToDataset(
          userRole,
          user.id,
          bucket,
          datasetId
        );
        if (!hasAccess) {
          return NextResponse.json(
            { error: "You do not have access to upload to this dataset" },
            { status: 403 }
          );
        }
      } else if (datasetId && !SAFE_SEGMENT_PATTERN.test(datasetId)) {
        return NextResponse.json(
          { error: "Invalid datasetId folder value" },
          { status: 400 }
        );
      }
    }

    const fileExt = getSanitizedExtension(file);
    const filePath = datasetId
      ? `${datasetId}/${user.id}/${Date.now()}_${randomUUID().slice(0, 12)}.${fileExt}`
      : `${user.id}/${Date.now()}_${randomUUID().slice(0, 12)}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: `${bucket}/${filePath}`,
      Body: buffer,
      ContentType: file.type,
      ACL: "public-read",
      CacheControl: "max-age=3600",
    });

    await spacesClient.send(command);

    const url = `${CDN_URL}/${bucket}/${filePath}`;

    return NextResponse.json({ url, path: filePath, error: null });
  } catch (error) {
    logError("upload.post_failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const bucket = typeof body?.bucket === "string" ? body.bucket.trim() : "";
    const path = typeof body?.path === "string" ? body.path.trim() : "";

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "Missing bucket or path parameter" },
        { status: 400 }
      );
    }

    if (!isAllowedBucket(bucket)) {
      return NextResponse.json(
        { error: "Bucket is not allowed" },
        { status: 400 }
      );
    }

    if (!isSafePath(path)) {
      return NextResponse.json(
        { error: "Invalid file path" },
        { status: 400 }
      );
    }

    const userRole = await getUserRole(user.id);
    if (!userRole) {
      return NextResponse.json({ error: "Unable to resolve user role" }, { status: 403 });
    }

    if (userRole !== "admin" && !pathBelongsToUser(path, user.id)) {
      return NextResponse.json(
        { error: "You can only delete files you own" },
        { status: 403 }
      );
    }

    const command = new DeleteObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: `${bucket}/${path}`,
    });

    await spacesClient.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("upload.delete_failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
