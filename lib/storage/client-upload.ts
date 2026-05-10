"use client";

export async function uploadFileClient(
  file: File,
  bucket: string,
  datasetId?: string
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", bucket);
    if (datasetId) {
      formData.append("datasetId", datasetId);
    }

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { url: null, path: null, error: errorData.error || "Upload failed" };
    }

    const data = await response.json();
    return { url: data.url, path: data.path, error: null };
  } catch (error) {
    console.error("Error uploading file:", error);
    return {
      url: null,
      path: null,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
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
  try {
    // Use API route to delete from DigitalOcean Spaces
    const response = await fetch("/api/upload", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bucket, path }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.error || "Delete failed" };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("Error deleting file:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}
