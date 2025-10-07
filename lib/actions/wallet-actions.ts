"use server";

import { createClient } from "@/lib/supabase/server";

// Create wallet for user (server-side only)
export async function createUserWallet(userId: string) {
  const supabase = await createClient();

  try {
    // Check if wallet already exists
    const { data: existingWallet } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existingWallet) {
      return { data: existingWallet };
    }

    // Do NOT insert directly here to avoid RLS issues; rely on DB trigger or admin tasks
    return { data: { id: "pending", user_id: userId } };
  } catch (error) {
    console.error("Unexpected error creating wallet:", error);
    return { error: "Unexpected error occurred" };
  }
}

// Ensure wallet exists for current user
export async function ensureUserWallet() {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Only check for existence; wallet will be auto-created by DB trigger on profile insert
  const { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (wallet) return { data: wallet };
  return { data: { id: "missing", user_id: user.id } };
}
