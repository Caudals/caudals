import { createBrowserClient } from "@supabase/ssr";
import { enforceImplicitAuthFlow } from "@/lib/supabase/enforce-implicit-flow";

export function createClient() {
  return enforceImplicitAuthFlow(
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          // Using implicit flow for self-hosted Supabase to avoid PKCE code_verifier
          // cookie issues with email-based auth (password reset, magic links).
          // The implicit flow passes tokens via URL hash fragments instead.
          flowType: "implicit",
        },
      }
    )
  );
}
