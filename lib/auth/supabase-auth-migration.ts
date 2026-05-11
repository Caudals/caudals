import { createHash } from "node:crypto";

import type { OperatorRole } from "@/lib/auth/operator-session";

const crockfordBase32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type LegacySupabaseAuthRow = {
  legacyUserId: string;
  email: string;
  emailVerified: boolean;
  createdAt: string | Date;
  updatedAt: string | Date | null;
  profileName?: string | null;
  profileAvatarUrl?: string | null;
  profileRole?: string | null;
  profileMail?: string | null;
  rawUserMetadata?: Record<string, unknown> | null;
};

export type MigratedOperatorIdentity = {
  legacyUserId: string;
  authUserId: string;
  authAccountId: string;
  authMemberId: string;
  operatorId: string;
  email: string;
  name: string;
  image: string | null;
  legacyRole: string;
  operatorRole: OperatorRole;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export function deterministicPrefixedId(prefix: string, source: string) {
  const digest = createHash("sha256").update(source).digest();
  let encoded = "";

  for (let index = 0; encoded.length < 26; index += 1) {
    encoded += crockfordBase32[digest[index % digest.length] % 32];
  }

  return `${prefix}_${encoded}`;
}

export function mapLegacySupabaseRole(
  role: string | null | undefined,
  includeNonAdmins = false
): OperatorRole | null {
  const normalized = role?.trim().toLowerCase();

  if (normalized === "admin") {
    return "admin";
  }

  return includeNonAdmins ? "operations" : null;
}

export function buildMigratedOperatorIdentity(
  row: LegacySupabaseAuthRow,
  includeNonAdmins = false
): MigratedOperatorIdentity | null {
  const email = (row.profileMail || row.email).trim().toLowerCase();
  const rawRole = readMetadataString(row.rawUserMetadata, "role");
  const legacyRole = (row.profileRole || rawRole || "unknown").trim();
  const operatorRole = mapLegacySupabaseRole(legacyRole, includeNonAdmins);

  if (!operatorRole) {
    return null;
  }

  const name =
    row.profileName?.trim() ||
    readMetadataString(row.rawUserMetadata, "full_name") ||
    email.split("@")[0] ||
    "Migrated operator";
  const createdAt = normalizeDate(row.createdAt);
  const updatedAt = normalizeDate(row.updatedAt ?? row.createdAt);

  return {
    legacyUserId: row.legacyUserId,
    authUserId: deterministicPrefixedId("au", `auth_user:${row.legacyUserId}`),
    authAccountId: deterministicPrefixedId(
      "aa",
      `auth_account:${row.legacyUserId}`
    ),
    authMemberId: deterministicPrefixedId(
      "am",
      `auth_member:${row.legacyUserId}`
    ),
    operatorId: deterministicPrefixedId("op", `operator:${row.legacyUserId}`),
    email,
    name,
    image:
      row.profileAvatarUrl ||
      readMetadataString(row.rawUserMetadata, "avatar_url") ||
      null,
    legacyRole,
    operatorRole,
    emailVerified: row.emailVerified,
    createdAt,
    updatedAt,
  };
}

function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDate(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}
