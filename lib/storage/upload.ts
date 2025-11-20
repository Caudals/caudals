"use server";

import { createClient } from "@/lib/supabase/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spacesClient, SPACES_BUCKET, CDN_URL } from "./spaces-client";

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

  try {
    // Convert File to Buffer for S3 upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to DigitalOcean Spaces
    const command = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: `${bucket}/${filePath}`, // Prefix with bucket name to organize files
      Body: buffer,
      ContentType: file.type,
      ACL: "public-read",
      CacheControl: "max-age=3600",
    });

    await spacesClient.send(command);

    // Generate CDN URL
    const fullUrl = `${CDN_URL}/${bucket}/${filePath}`;

    return { url: fullUrl, error: null };
  } catch (error) {
    console.error("Error uploading file:", error);
    return { url: null, error: error instanceof Error ? error.message : "Upload failed" };
  }

  /* ORIGINAL SUPABASE CODE - KEPT FOR REFERENCE
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

  // Get public URL - ensure it's properly formatted
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  // Ensure the URL is absolute and properly formatted
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const fullUrl = publicUrl.startsWith('http')
    ? publicUrl
    : `${baseUrl}/storage/v1/object/public/${bucket}/${data.path}`;

  return { url: fullUrl, error: null };
  */
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
  try {
    const command = new DeleteObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: `${bucket}/${path}`, // Match the upload structure
    });

    await spacesClient.send(command);

    return { success: true, error: null };
  } catch (error) {
    console.error("Error deleting file:", error);
    return { success: false, error: error instanceof Error ? error.message : "Delete failed" };
  }

  /* ORIGINAL SUPABASE CODE - KEPT FOR REFERENCE
  const supabase = await createClient();

  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    console.error("Error deleting file:", error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
  */
}

export async function getPublicUrl(
  bucket: string,
  path: string
): Promise<string> {
  // Generate CDN URL for DigitalOcean Spaces
  return `${CDN_URL}/${bucket}/${path}`;

  /* ORIGINAL SUPABASE CODE - KEPT FOR REFERENCE
  const supabase = await createClient();

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return publicUrl;
  */
}
