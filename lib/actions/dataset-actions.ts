"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  Dataset,
  DatasetCategory,
  DataType,
  DatasetStatus,
} from "@/types/dataset";

export async function getDatasets() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dataset_requests")
    .select(
      `
      *,
      profiles:created_by (
        id,
        full_name,
        avatar_url
      ),
      submissions(contributor_id)
    `
    )
    .eq("approval_status", "approved") // Only show approved datasets
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching datasets:", error);
    return [];
  }

  // Transform database data to match Dataset type
  const datasets: Dataset[] = data.map((item) => {
    const uniqueContributors = new Set(
      item.submissions?.map(
        (s: { contributor_id: string }) => s.contributor_id
      ) || []
    );

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category as DatasetCategory,
      dataType: item.data_type as DataType,
      status: item.status as DatasetStatus,
      organization: {
        id: item.profiles?.id || "",
        name: item.profiles?.full_name || "Unknown",
        avatar: item.profiles?.avatar_url,
        verified: false, // Can be enhanced later
      },
      samplesNeeded: item.samples_needed,
      samplesCollected: item.samples_collected,
      rewardAmount: Number(item.reward_amount),
      currency: item.currency,
      activeContributors: uniqueContributors.size,
      deadline: item.deadline,
      datePosted: item.created_at,
      qualityCriteria: item.quality_criteria || [],
      requirements: item.requirements || [],
      featured: item.featured,
    };
  });

  return datasets;
}

export async function getDatasetById(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dataset_requests")
    .select(
      `
      *,
      profiles:created_by (
        id,
        full_name,
        avatar_url
      ),
      submissions(contributor_id)
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("Error fetching dataset:", error);
    return null;
  }

  const uniqueContributors = new Set(
    data.submissions?.map(
      (s: { contributor_id: string }) => s.contributor_id
    ) || []
  );

  const dataset: Dataset = {
    id: data.id,
    title: data.title,
    description: data.description,
    category: data.category as DatasetCategory,
    dataType: data.data_type as DataType,
    status: data.status as DatasetStatus,
    organization: {
      id: data.profiles?.id || "",
      name: data.profiles?.full_name || "Unknown",
      avatar: data.profiles?.avatar_url,
      verified: false,
    },
    samplesNeeded: data.samples_needed,
    samplesCollected: data.samples_collected,
    rewardAmount: Number(data.reward_amount),
    currency: data.currency,
    activeContributors: uniqueContributors.size,
    deadline: data.deadline,
    datePosted: data.created_at,
    qualityCriteria: data.quality_criteria || [],
    requirements: data.requirements || [],
    featured: data.featured,
  };

  return dataset;
}

export async function createDatasetRequest(formData: {
  title: string;
  description: string;
  category: DatasetCategory;
  dataType: DataType;
  samplesNeeded: number;
  qualityCriteria: string[];
  requirements: string[];
  rewardAmount: number;
  currency: string;
  deadline: string;
}) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate category against allowed set
  const allowedCategories: DatasetCategory[] = [
    "computer-vision",
    "natural-language",
    "speech-audio",
    "healthcare",
    "robotics",
    "other",
  ];

  if (!allowedCategories.includes(formData.category)) {
    return { error: "Invalid category. Please select a valid dataset category." };
  }

  const { data, error } = await supabase
    .from("dataset_requests")
    .insert({
      created_by: user.id,
      title: formData.title,
      description: formData.description,
      category: formData.category,
      data_type: formData.dataType,
      samples_needed: formData.samplesNeeded,
      quality_criteria: formData.qualityCriteria,
      requirements: formData.requirements,
      reward_amount: formData.rewardAmount,
      currency: formData.currency,
      deadline: formData.deadline,
      approval_status: "pending", // All new requests need admin approval
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating dataset request:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");

  return { data };
}

export async function updateDatasetRequest(
  id: string,
  updates: {
    title?: string;
    description?: string;
    status?: string;
    deadline?: string;
    reward_amount?: number;
  }
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dataset_requests")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating dataset request:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");

  return { data };
}

export async function deleteDatasetRequest(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("dataset_requests")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting dataset request:", error);
    return { error: error.message };
  }

  revalidatePath("/browse");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");

  return { success: true };
}

export async function getUserDatasetRequests() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("dataset_requests")
    .select(
      `
      *,
      submissions(contributor_id, status)
    `
    )
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching user datasets:", error);
    return [];
  }

  return data || [];
}
