"use server";

import { createClient } from "@/lib/supabase/server";
import JSZip from "jszip";

// Helper function to get contributor name safely
function getContributorName(submission: { profiles?: { full_name?: string } | { full_name?: string }[] }): string {
  if (Array.isArray(submission.profiles)) {
    return submission.profiles[0]?.full_name || "Anonymous";
  }
  return submission.profiles?.full_name || "Anonymous";
}

// Get approved submissions for a dataset
export async function getApprovedSubmissionsForDataset(datasetId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify the user owns this dataset request
  const { data: dataset, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("id, created_by, title")
    .eq("id", datasetId)
    .eq("created_by", user.id)
    .single();

  if (datasetError || !dataset) {
    return { error: "Dataset not found or access denied" };
  }

  // Get all approved submissions for this dataset
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select(`
      id,
      file_urls,
      metadata,
      notes,
      created_at,
      profiles:contributor_id (
        id,
        full_name
      )
    `)
    .eq("dataset_request_id", datasetId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (submissionsError) {
    console.error("Error fetching submissions:", submissionsError);
    return { error: submissionsError.message };
  }

  return { data: { dataset, submissions } };
}

// Create a ZIP file with all approved files
export async function createDatasetZip(datasetId: string) {
  const result = await getApprovedSubmissionsForDataset(datasetId);
  
  if (result.error) {
    return { error: result.error };
  }

  const { dataset, submissions } = result.data!;
  const zip = new JSZip();

  // Create a folder structure
  const datasetFolder = zip.folder(dataset.title.replace(/[^a-zA-Z0-9]/g, '_'));
  
  if (!datasetFolder) {
    return { error: "Failed to create dataset folder" };
  }

  // Add metadata file
  const metadata = {
    dataset_title: dataset.title,
    dataset_id: dataset.id,
    export_date: new Date().toISOString(),
    total_submissions: submissions.length,
    total_files: submissions.reduce((sum, sub) => sum + (sub.file_urls?.length || 0), 0),
    submissions: submissions.map(sub => ({
      submission_id: sub.id,
      contributor: getContributorName(sub),
      file_count: sub.file_urls?.length || 0,
      notes: sub.notes,
      submitted_at: sub.created_at
    }))
  };

  datasetFolder.file("dataset_metadata.json", JSON.stringify(metadata, null, 2));

  // Add files from each submission
  for (const submission of submissions) {
    const contributorName = getContributorName(submission);
    const contributorFolder = datasetFolder.folder(
      `contributor_${contributorName.replace(/[^a-zA-Z0-9]/g, '_')}_${submission.id.slice(0, 8)}`
    );

    if (!contributorFolder) continue;

    // Add submission metadata
    contributorFolder.file("submission_info.json", JSON.stringify({
      submission_id: submission.id,
      contributor: contributorName,
      notes: submission.notes,
      submitted_at: submission.created_at,
      file_count: submission.file_urls?.length || 0
    }, null, 2));

    // Add files
    if (submission.file_urls) {
      for (let i = 0; i < submission.file_urls.length; i++) {
        const fileUrl = submission.file_urls[i];
        try {
          // Fetch the file
          const response = await fetch(fileUrl);
          if (!response.ok) continue;

          const fileBuffer = await response.arrayBuffer();
          const fileName = fileUrl.split('/').pop() || `file_${i + 1}`;
          
          contributorFolder.file(fileName, fileBuffer);
        } catch (error) {
          console.error(`Failed to fetch file ${fileUrl}:`, error);
          // Add a placeholder file indicating the error
          contributorFolder.file(`error_${i + 1}.txt`, `Failed to download: ${fileUrl}\nError: ${error}`);
        }
      }
    }
  }

  // Generate the ZIP file
  try {
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
    return { data: zipBuffer };
  } catch (error) {
    console.error("Error creating ZIP file:", error);
    return { error: "Failed to create ZIP file" };
  }
}

// Get export statistics for a dataset
export async function getDatasetExportStats(datasetId: string) {
  const result = await getApprovedSubmissionsForDataset(datasetId);
  
  if (result.error) {
    return { error: result.error };
  }

  const { dataset, submissions } = result.data!;
  
  const stats = {
    dataset_title: dataset.title,
    total_submissions: submissions.length,
    total_files: submissions.reduce((sum, sub) => sum + (sub.file_urls?.length || 0), 0),
    total_size: submissions.reduce((sum, sub) => sum + (sub.metadata?.totalSize || 0), 0),
    contributors: [...new Set(submissions.map(sub => getContributorName(sub)))],
    date_range: {
      earliest: submissions.length > 0 ? submissions[0].created_at : null,
      latest: submissions.length > 0 ? submissions[submissions.length - 1].created_at : null
    }
  };

  return { data: stats };
}

// Export dataset to CSV (legacy function for compatibility)
export async function exportDatasetToCSV(datasetId: string, _statusFilter?: string) {
  const result = await getApprovedSubmissionsForDataset(datasetId);
  
  if (result.error) {
    return { error: result.error };
  }

  const { submissions } = result.data!;
  
  // All submissions are already approved, so no need to filter by status
  const filteredSubmissions = submissions;

  // Create CSV content
  const headers = [
    "Submission ID",
    "Contributor",
    "File Count",
    "File URLs",
    "Notes",
    "Submitted At"
  ];

  const rows = filteredSubmissions.map(sub => [
    sub.id,
    getContributorName(sub),
    sub.file_urls?.length || 0,
    sub.file_urls?.join("; ") || "",
    sub.notes || "",
    sub.created_at
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  return { data: csvContent };
}

// Export dataset to JSON (legacy function for compatibility)
export async function exportDatasetToJSON(datasetId: string) {
  const result = await getApprovedSubmissionsForDataset(datasetId);
  
  if (result.error) {
    return { error: result.error };
  }

  const { dataset, submissions } = result.data!;
  
  const exportData = {
    dataset: {
      id: dataset.id,
      title: dataset.title
    },
    export_date: new Date().toISOString(),
    submissions: submissions.map(sub => ({
      id: sub.id,
      contributor: getContributorName(sub),
      file_urls: sub.file_urls || [],
      metadata: sub.metadata,
      notes: sub.notes,
      created_at: sub.created_at
    }))
  };

  return { data: JSON.stringify(exportData, null, 2) };
}