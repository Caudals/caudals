import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client with implicit flow.
 * Use ONLY for password recovery to avoid PKCE issues with email links.
 *
 * For all other auth operations (login, OAuth, etc.), use the regular client.
 */
export function createImplicitClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Implicit flow: tokens in URL hash fragment (#access_token=...)
        // Needed for self-hosted Supabase password recovery
        flowType: "implicit",
      },
    }
  );
}
