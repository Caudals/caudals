import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
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
  );
}
