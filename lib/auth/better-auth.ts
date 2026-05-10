import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";

import { betterAuthBasePath } from "@/lib/auth/better-auth-shared";
import { getPostgresPool } from "@/lib/db/client";

const APP_NAME = "Caudals";
const LOCAL_AUTH_URL = "http://localhost:3000";
const PRODUCTION_AUTH_URL = "https://app.caudals.com";

let cachedAuth: ReturnType<typeof betterAuth> | null = null;

function splitEnvList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.origin;
  } catch {
    return null;
  }
}

function getBetterAuthUrl() {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === "production"
      ? PRODUCTION_AUTH_URL
      : LOCAL_AUTH_URL)
  );
}

function getTrustedOrigins(baseUrl: string) {
  const origins = new Set<string>();
  const addOrigin = (value: string | null) => {
    if (value) {
      origins.add(value);
    }
  };

  addOrigin(normalizeOrigin(baseUrl));
  splitEnvList(process.env.BETTER_AUTH_TRUSTED_ORIGINS).forEach((origin) =>
    addOrigin(normalizeOrigin(origin))
  );
  splitEnvList(process.env.NEXT_PUBLIC_APP_HOSTNAMES).forEach((origin) =>
    addOrigin(normalizeOrigin(origin))
  );

  return Array.from(origins);
}

function getPasskeyRpId(baseUrl: string) {
  if (process.env.BETTER_AUTH_PASSKEY_RP_ID) {
    return process.env.BETTER_AUTH_PASSKEY_RP_ID;
  }

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "localhost";
  }
}

function createBetterAuthOptions(): BetterAuthOptions {
  const baseURL = getBetterAuthUrl();
  const trustedOrigins = getTrustedOrigins(baseURL);

  return {
    appName: APP_NAME,
    baseURL,
    basePath: betterAuthBasePath,
    database: getPostgresPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 15,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
        strategy: "jwe",
      },
    },
    advanced: {
      cookiePrefix: "caudals",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
      skipTrailingSlashes: true,
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
        cancelPendingInvitationsOnReInvite: true,
        disableOrganizationDeletion: true,
        invitationExpiresIn: 60 * 60 * 24,
      }),
      twoFactor({
        issuer: APP_NAME,
        twoFactorCookieMaxAge: 60 * 10,
        trustDeviceMaxAge: 60 * 60 * 8,
      }),
      passkey({
        rpID: getPasskeyRpId(baseURL),
        rpName: APP_NAME,
        origin: trustedOrigins,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
      }),
      nextCookies(),
    ],
  };
}

export function getBetterAuth() {
  if (!cachedAuth) {
    cachedAuth = betterAuth(createBetterAuthOptions());
  }

  return cachedAuth;
}
