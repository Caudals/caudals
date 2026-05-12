import "server-only";

import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { spacesClient, SPACES_BUCKET, CDN_URL } from "@/lib/storage/spaces-client";
import type { CurrentSupplierSession } from "@/lib/supplier/session";

const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,159}$/;
const MAX_SAMPLE_UPLOAD_BYTES = 100 * 1024 * 1024;
const SIGNED_UPLOAD_TTL_SECONDS = 15 * 60;

const EXACT_SAMPLE_MIME_TYPES = new Set([
  "application/csv",
  "application/gzip",
  "application/json",
  "application/jsonl",
  "application/pdf",
  "application/vnd.apache.parquet",
  "application/x-gzip",
  "application/x-ndjson",
  "application/zip",
  "text/csv",
  "text/plain",
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "application/csv": "csv",
  "application/gzip": "gz",
  "application/json": "json",
  "application/jsonl": "jsonl",
  "application/pdf": "pdf",
  "application/vnd.apache.parquet": "parquet",
  "application/x-gzip": "gz",
  "application/x-ndjson": "jsonl",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export type SupplierSampleUploadInput = {
  assetId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export type SupplierSampleUploadPlan = {
  bucket: string;
  key: string;
  uri: string;
  contentType: string;
  expiresInSeconds: number;
};

export function isAllowedSupplierSampleMime(contentType: string) {
  if (!contentType) {
    return false;
  }

  return (
    EXACT_SAMPLE_MIME_TYPES.has(contentType) ||
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/")
  );
}

export function validateSupplierSampleUploadInput(
  input: SupplierSampleUploadInput,
): string | null {
  if (!/^sa_[0-9A-HJKMNP-TV-Z]{10,}$/.test(input.assetId)) {
    return "Choose a valid supplier asset.";
  }

  if (!SAFE_FILENAME_PATTERN.test(input.fileName)) {
    return "Use a file name with letters, numbers, spaces, dots, dashes, or underscores.";
  }

  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    return "Choose a non-empty sample file.";
  }

  if (input.sizeBytes > MAX_SAMPLE_UPLOAD_BYTES) {
    return "Sample files are limited to 100 MB.";
  }

  if (!isAllowedSupplierSampleMime(input.contentType)) {
    return "This file type is not allowed for supplier samples.";
  }

  return null;
}

function getSanitizedExtension(fileName: string, contentType: string) {
  const fromName = fileName
    .split(".")
    .pop()
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (fromName && fromName.length <= 12) {
    return fromName;
  }

  return MIME_TO_EXTENSION[contentType] ?? "bin";
}

export function buildSupplierSampleUploadPlan(
  session: CurrentSupplierSession,
  input: SupplierSampleUploadInput,
): SupplierSampleUploadPlan {
  const extension = getSanitizedExtension(input.fileName, input.contentType);
  const objectName = `${Date.now()}_${randomUUID().slice(0, 12)}.${extension}`;
  const key = `dataset-files/supplier-samples/${session.supplier.id}/${input.assetId}/${objectName}`;

  return {
    bucket: SPACES_BUCKET,
    key,
    uri: CDN_URL ? `${CDN_URL}/${key}` : `s3://${SPACES_BUCKET}/${key}`,
    contentType: input.contentType,
    expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
  };
}

export async function createSupplierSampleUploadUrl(
  plan: SupplierSampleUploadPlan,
) {
  const command = new PutObjectCommand({
    Bucket: plan.bucket,
    Key: plan.key,
    ContentType: plan.contentType,
    CacheControl: "private, max-age=0",
  });

  return getSignedUrl(spacesClient, command, {
    expiresIn: plan.expiresInSeconds,
  });
}
