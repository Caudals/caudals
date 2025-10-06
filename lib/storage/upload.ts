"use server";

import { createClient } from "@/lib/supabase/server";

export async function uploadFile(
  file: File,
  bucket: string,
  path?: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { url: null, error: "Not authenticated" };
  }

  // Generate unique filename
  const fileExt = file.name.split(".").pop();
  const fileName = `${user.id}/${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}.${fileExt}`;
  const filePath = path ? `${path}/${fileName}` : fileName;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Error uploading file:", error);
    return { url: null, error: error.message };
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return { url: publicUrl, error: null };
}

export async function uploadMultipleFiles(
  files: File[],
  bucket: string,
  path?: string
): Promise<{ urls: string[]; errors: string[] }> {
  const results = await Promise.all(
    files.map((file) => uploadFile(file, bucket, path))
  );

  const urls = results.filter((r) => r.url).map((r) => r.url as string);

  const errors = results.filter((r) => r.error).map((r) => r.error as string);

  return { urls, errors };
}

export async function deleteFile(
  bucket: string,
  path: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    console.error("Error deleting file:", error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

export async function getPublicUrl(
  bucket: string,
  path: string
): Promise<string> {
  const supabase = await createClient();

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return publicUrl;
}
