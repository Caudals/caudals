"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { betterAuthBasePath } from "@/lib/auth/better-auth-shared";

// Same Better Auth server and cookies. Keep challenge/return navigation local to
// this form; the legacy singleton's plugin redirects to /auth/sign-in.
export const betterAuthClient = createAuthClient({
  basePath: betterAuthBasePath,
  disableDefaultFetchPlugins: true,
  plugins: [twoFactorClient({ onTwoFactorRedirect: async () => {} })],
});
