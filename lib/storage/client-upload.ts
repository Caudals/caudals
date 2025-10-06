"use client";

import { createClient } from "@/lib/supabase/client";

export async function uploadFileClient(
  file: File,
  bucket: string,
  datasetId?: string
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { url: null, path: null, error: "Not authenticated" };
  }

  // Organize files by dataset and user
  const fileExt = file.name.split(".").pop();
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);

  // Structure: {dataset_id}/{user_id}/{timestamp}_{filename}
  const filePath = datasetId
    ? `${datasetId}/${user.id}/${timestamp}_${randomId}.${fileExt}`
    : `${user.id}/${timestamp}_${randomId}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Error uploading file:", error);
    return { url: null, path: null, error: error.message };
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return { url: publicUrl, path: data.path, error: null };
}

export async function uploadMultipleFilesClient(
  files: File[],
  bucket: string,
  datasetId?: string,
  onProgress?: (progress: number) => void
): Promise<{ urls: string[]; paths: string[]; errors: string[] }> {
  const urls: string[] = [];
  const paths: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const result = await uploadFileClient(files[i], bucket, datasetId);

    if (result.url && result.path) {
      urls.push(result.url);
      paths.push(result.path);
    }
    if (result.error) {
      errors.push(result.error);
    }

    // Update progress
    if (onProgress) {
      onProgress(((i + 1) / files.length) * 100);
    }
  }

  return { urls, paths, errors };
}

export async function deleteFileClient(
  bucket: string,
  path: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();

  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    console.error("Error deleting file:", error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}
