import { betterAuth } from "better-auth";

import { createBetterAuthOptions } from "@/lib/auth/better-auth-options";
import { getPostgresPool } from "@/lib/db/client";

let cachedAuth: ReturnType<typeof betterAuth> | null = null;

export function getBetterAuth() {
  if (!cachedAuth) {
    cachedAuth = betterAuth(createBetterAuthOptions(getPostgresPool()));
  }

  return cachedAuth;
}
