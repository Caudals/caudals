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

    // Create new wallet
    const { data: newWallet, error } = await supabase
      .from("wallets")
      .insert({
        user_id: userId,
        balance: 0.00,
        currency: 'USD'
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating wallet:", error);
      return { error: "Failed to create wallet" };
    }

    return { data: newWallet };
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

  return await createUserWallet(user.id);
}
