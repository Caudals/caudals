"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  actionError,
  parseInput,
} from "@/lib/validators/action-envelope";
import { walletCreateSchema } from "@/lib/validators/requester-admin";
import type { Database } from "@/types/database";

type WalletRow = Database["public"]["Tables"]["wallets"]["Row"];

export async function createUserWallet(userId: string) {
  const parsedInput = parseInput(
    walletCreateSchema,
    { userId },
    "Invalid user id for wallet creation"
  );
  if (!parsedInput.success) {
    return parsedInput.error;
  }

  const adminClient = createAdminClient("payments_ledger") as any;
  const { data, error } = await adminClient
    .from("wallets")
    .upsert(
      {
        user_id: parsedInput.data.userId,
        currency: "usd",
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return actionError("DB_ERROR", error?.message ?? "Failed to create wallet");
  }

  return { data: data as WalletRow };
}

export async function ensureUserWallet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return actionError("UNAUTHORIZED", "Not authenticated");
  }

  const { data, error } = await supabase
    .from("wallets")
    .upsert(
      {
        user_id: user.id,
        currency: "usd",
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return actionError("DB_ERROR", error?.message ?? "Failed to load wallet");
  }

  return { data: data as WalletRow };
}
