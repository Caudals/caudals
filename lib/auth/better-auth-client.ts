"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";

import { betterAuthBasePath } from "@/lib/auth/better-auth-shared";

export const betterAuthClient = createAuthClient({
  basePath: betterAuthBasePath,
  plugins: [
    organizationClient(),
    twoFactorClient({
      twoFactorPage: "/auth/sign-in",
    }),
    passkeyClient(),
  ],
});

export const { useSession } = betterAuthClient;
