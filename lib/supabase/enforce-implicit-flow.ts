import type { SupabaseClient } from "@supabase/supabase-js";

export function enforceImplicitAuthFlow<T extends SupabaseClient>(
  client: T
): T {
  // @supabase/ssr forces PKCE by default which breaks email-based
  // password recovery on self-hosted GoTrue unless the email is opened
  // in the same browser. Override the internal flag to keep using the
  // implicit flow so Supabase returns hash-based tokens instead of PKCE codes.
  const auth = client.auth as { flowType?: string };
  if (auth && auth.flowType !== "implicit") {
    auth.flowType = "implicit";
  }

  return client;
}
