"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createSubmission(formData: {
  datasetRequestId: string;
  fileUrls: string[];
  metadata?: Record<string, any>;
  notes?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      dataset_request_id: formData.datasetRequestId,
      contributor_id: user.id,
      file_urls: formData.fileUrls,
      metadata: formData.metadata || {},
      notes: formData.notes,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating submission:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/dashboard");

  return { data };
}

export async function getSubmissionsByDatasetRequest(datasetRequestId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select(
      `
      *,
      profiles:contributor_id (
        id,
        full_name,
        avatar_url
      )
    `
    )
    .eq("dataset_request_id", datasetRequestId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching submissions:", error);
    return [];
  }

  return data || [];
}

export async function getUserSubmissions() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("submissions")
    .select(
      `
      *,
      dataset_requests:dataset_request_id (
        id,
        title,
        reward_amount,
        currency
      )
    `
    )
    .eq("contributor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching user submissions:", error);
    return [];
  }

  return data || [];
}

export async function updateSubmissionStatus(
  submissionId: string,
  status: "pending" | "approved" | "rejected",
  notes?: string
) {
  const supabase = await createClient();

  const updates: any = { status };
  if (notes) {
    updates.notes = notes;
  }

  const { data, error } = await supabase
    .from("submissions")
    .update(updates)
    .eq("id", submissionId)
    .select()
    .single();

  if (error) {
    console.error("Error updating submission status:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");

  return { data };
}

export async function deleteSubmission(submissionId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId);

  if (error) {
    console.error("Error deleting submission:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/dashboard");

  return { success: true };
}
