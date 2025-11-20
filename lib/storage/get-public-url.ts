/**
 * Utility to get proper public URLs for DigitalOcean Spaces CDN
 * Updated to use DO Spaces instead of Supabase Storage
 */

const CDN_URL = process.env.NEXT_PUBLIC_DO_SPACES_CDN_URL || "";

export function getStoragePublicUrl(bucket: string, path: string): string {
  if (!CDN_URL) {
    console.error("NEXT_PUBLIC_DO_SPACES_CDN_URL is not defined");
    return "";
  }

  // Remove any leading slashes from path
  const cleanPath = path.replace(/^\/+/, "");

  // Build the full CDN URL
  return `${CDN_URL}/${bucket}/${cleanPath}`;

  /* ORIGINAL SUPABASE CODE - KEPT FOR REFERENCE
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!baseUrl) {
    console.error("NEXT_PUBLIC_SUPABASE_URL is not defined");
    return "";
  }

  // Remove any leading slashes from path
  const cleanPath = path.replace(/^\/+/, "");

  // Build the full public URL
  return `${baseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`;
  */
}

/**
 * Check if a URL is a valid storage URL (DO Spaces or Supabase)
 */
export function isStorageUrl(url: string): boolean {
  if (!url) return false;

  // Check for DO Spaces CDN URL
  if (url.includes("storage.caudals.com")) {
    return true;
  }

  // Check for old Supabase Storage URLs (for backward compatibility during migration)
  return url.includes("/storage/v1/object/public/") ||
         url.includes(".supabase.co/storage/") ||
         url.includes(".digitaloceanspaces.com");

  /* ORIGINAL SUPABASE CODE - KEPT FOR REFERENCE
  if (!url) return false;
  return url.includes("/storage/v1/object/public/") ||
         url.includes(".supabase.co/storage/");
  */
}

/**
 * Normalize storage URLs to ensure they're properly formatted
 * Now supports both DO Spaces CDN and legacy Supabase URLs
 */
export function normalizeStorageUrl(url: string): string {
  if (!url) return "";

  // If it's already a full URL, return it
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // If it's a placeholder or other asset, return as is
  if (url.startsWith("/")) {
    return url;
  }

  // If it looks like a storage path, convert it to DO Spaces CDN URL
  if (CDN_URL) {
    return `${CDN_URL}/${url}`;
  }

  return url;

  /* ORIGINAL SUPABASE CODE - KEPT FOR REFERENCE
  if (!url) return "";

  // If it's already a full URL, return it
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // If it's a placeholder or other asset, return as is
  if (url.startsWith("/")) {
    return url;
  }

  // If it looks like a storage path, convert it
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return url;

  return `${baseUrl}/storage/v1/object/public/${url}`;
  */
}
