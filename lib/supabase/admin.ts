import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const SERVICE_ROLE_SCOPES = [
  "payments_ledger",
  "stripe_webhooks",
] as const;

export type ServiceRoleScope = (typeof SERVICE_ROLE_SCOPES)[number];

export function createAdminClient(scope: ServiceRoleScope) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-caudals-service-role-scope": scope,
      },
    },
  });
}
