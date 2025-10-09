"use server";

import { createClient } from "@/lib/supabase/server";

// Create wallet for user (server-side only) - Wallets table removed
export async function createUserWallet(userId: string) {
  // Since wallets table is removed, return mock data
  // The actual balance is managed by Stripe, not our internal wallet
  return { data: { id: "stripe-managed", user_id: userId } };
}

// Ensure wallet exists for current user - Wallets table removed
export async function ensureUserWallet() {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Since wallets table is removed, return mock data
  // The actual balance is managed by Stripe, not our internal wallet
  return { data: { id: "stripe-managed", user_id: user.id } };
}
