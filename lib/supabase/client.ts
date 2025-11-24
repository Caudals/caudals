import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // PKCE keeps email recovery/reset links working on self-hosted GoTrue
        // and matches Supabase's recommended browser flow.
        flowType: "pkce",
      },
    }
  );
}
