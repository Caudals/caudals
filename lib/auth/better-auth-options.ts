import { passkey } from "@better-auth/passkey";
import type { BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";

import { createBetterAuthId } from "@/lib/auth/better-auth-ids";
import { betterAuthBasePath } from "@/lib/auth/better-auth-shared";

const APP_NAME = "Caudals";
const LOCAL_AUTH_URL = "http://localhost:3000";
const PRODUCTION_AUTH_URL = "https://app.caudals.com";

type BetterAuthDatabase = NonNullable<BetterAuthOptions["database"]>;

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

export function createBetterAuthOptions(
  database: BetterAuthDatabase
): BetterAuthOptions {
  const baseURL = getBetterAuthUrl();
  const trustedOrigins = getTrustedOrigins(baseURL);

  return {
    appName: APP_NAME,
    baseURL,
    basePath: betterAuthBasePath,
    database,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
    user: {
      modelName: "auth_user",
    },
    session: {
      modelName: "auth_session",
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 15,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
        strategy: "jwe",
      },
    },
    account: {
      modelName: "auth_account",
    },
    verification: {
      modelName: "auth_verification",
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
    },
    advanced: {
      cookiePrefix: "caudals",
      database: {
        generateId: createBetterAuthId,
      },
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
        teams: {
          enabled: true,
          defaultTeam: {
            enabled: false,
          },
          maximumTeams: 12,
        },
        schema: {
          organization: {
            modelName: "auth_organization",
          },
          member: {
            modelName: "auth_member",
          },
          invitation: {
            modelName: "auth_invitation",
          },
          team: {
            modelName: "auth_team",
          },
          teamMember: {
            modelName: "auth_team_member",
          },
        },
      }),
      twoFactor({
        issuer: APP_NAME,
        twoFactorTable: "auth_two_factor",
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
        schema: {
          passkey: {
            modelName: "auth_passkey",
          },
        },
      }),
      nextCookies(),
    ],
  };
}
