/**
 * Utility to get proper public URLs for Supabase Storage
 * Handles edge cases where getPublicUrl might return relative URLs
 */

export function getStoragePublicUrl(bucket: string, path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  if (!baseUrl) {
    console.error("NEXT_PUBLIC_SUPABASE_URL is not defined");
    return "";
  }

  // Remove any leading slashes from path
  const cleanPath = path.replace(/^\/+/, "");
  
  // Build the full public URL
  return `${baseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`;
}

/**
 * Check if a URL is a valid Supabase Storage URL
 */
export function isStorageUrl(url: string): boolean {
  if (!url) return false;
  return url.includes("/storage/v1/object/public/") || 
         url.includes(".supabase.co/storage/");
}

/**
 * Normalize storage URLs to ensure they're properly formatted
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
  
  // If it looks like a storage path, convert it
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return url;
  
  return `${baseUrl}/storage/v1/object/public/${url}`;
}

