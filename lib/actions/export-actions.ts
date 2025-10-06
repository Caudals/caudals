"use server";

import { createClient } from "@/lib/supabase/server";

// Generate CSV export of dataset submissions
export async function exportDatasetToCSV(
  datasetId: string,
  statusFilter?: string
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify ownership
  const { data: dataset } = await supabase
    .from("dataset_requests")
    .select("created_by, title")
    .eq("id", datasetId)
    .single();

  if (dataset?.created_by !== user.id) {
    return { error: "Unauthorized" };
  }

  // Get submissions
  let query = supabase
    .from("submissions")
    .select(
      `
      *,
      profiles:contributor_id (
        full_name
      )
    `
    )
    .eq("dataset_request_id", datasetId);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: submissions, error } = await query;

  if (error) {
    return { error: error.message };
  }

  // Generate CSV
  const headers = [
    "Submission ID",
    "Contributor",
    "Status",
    "Files Count",
    "Submitted Date",
    "Notes",
  ];

  const rows = submissions?.map((sub) => {
    const profile = Array.isArray(sub.profiles)
      ? sub.profiles[0]
      : sub.profiles;
    return [
      sub.id,
      profile?.full_name || "Anonymous",
      sub.status,
      sub.file_urls?.length || 0,
      new Date(sub.created_at).toISOString(),
      sub.notes || "",
    ];
  });

  const csv = [
    headers.join(","),
    ...(rows?.map((row) => row.map((cell) => `"${cell}"`).join(",")) || []),
  ].join("\n");

  return {
    data: csv,
    filename: `${dataset.title.replace(/[^a-z0-9]/gi, "_")}_submissions.csv`,
  };
}

// Generate JSON export
export async function exportDatasetToJSON(datasetId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify ownership
  const { data: dataset } = await supabase
    .from("dataset_requests")
    .select("*")
    .eq("id", datasetId)
    .single();

  if (dataset?.created_by !== user.id) {
    return { error: "Unauthorized" };
  }

  // Get submissions
  const { data: submissions } = await supabase
    .from("submissions")
    .select(
      `
      *,
      profiles:contributor_id (
        full_name,
        avatar_url
      )
    `
    )
    .eq("dataset_request_id", datasetId);

  const exportData = {
    dataset: {
      id: dataset.id,
      title: dataset.title,
      description: dataset.description,
      category: dataset.category,
      data_type: dataset.data_type,
      samples_needed: dataset.samples_needed,
      samples_collected: dataset.samples_collected,
      deadline: dataset.deadline,
      created_at: dataset.created_at,
    },
    submissions: submissions || [],
    exported_at: new Date().toISOString(),
  };

  return {
    data: JSON.stringify(exportData, null, 2),
    filename: `${dataset.title.replace(/[^a-z0-9]/gi, "_")}_export.json`,
  };
}

// Get file download URLs for a submission
export async function getSubmissionFileUrls(submissionId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("file_urls")
    .eq("id", submissionId)
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data: data.file_urls || [] };
}
