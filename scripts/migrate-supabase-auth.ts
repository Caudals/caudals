import { randomBytes } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { Pool, type PoolClient } from "pg";

import {
  buildMigratedOperatorIdentity,
  deterministicPrefixedId,
  type LegacySupabaseAuthRow,
  type MigratedOperatorIdentity,
} from "@/lib/auth/supabase-auth-migration";
import { getDatabaseUrlFromEnv } from "@/lib/env/database-url";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply") || process.env.MIGRATE_SUPABASE_AUTH_APPLY === "true";
const includeNonAdmins =
  args.has("--include-non-admins") ||
  process.env.MIGRATE_SUPABASE_AUTH_INCLUDE_NON_ADMINS === "true";
const sendResets =
  args.has("--send-resets") ||
  process.env.MIGRATE_SUPABASE_AUTH_SEND_RESETS === "true";

const internalOrgId =
  process.env.OPERATOR_CONSOLE_ORG_ID ??
  deterministicPrefixedId("or", "organization:caudals-internal");
const defaultAuthOrganizationId = deterministicPrefixedId(
  "ao",
  "auth_organization:caudals-internal"
);

function getSourceDatabaseUrl() {
  const databaseUrl = process.env.LEGACY_SUPABASE_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "LEGACY_SUPABASE_DATABASE_URL is required for the legacy source database"
    );
  }

  return databaseUrl;
}

function getTargetDatabaseUrl() {
  return getDatabaseUrlFromEnv({
    missingMessage:
      "DATABASE_URL or DATABASE_URL_FILE is required for the target PostgreSQL database",
  });
}

async function main() {
  const sourcePool = new Pool({
    connectionString: getSourceDatabaseUrl(),
    max: 1,
  });
  let targetPool: Pool | null = null;

  try {
    const legacyRows = await fetchLegacyAuthRows(sourcePool);
    const identities = legacyRows
      .map((row) => buildMigratedOperatorIdentity(row, includeNonAdmins))
      .filter((identity): identity is MigratedOperatorIdentity => Boolean(identity));
    const skipped = legacyRows.length - identities.length;

    console.log(
      `Prepared ${identities.length} operator account migrations; skipped ${skipped} non-operator legacy accounts.`
    );

    if (!apply) {
      console.log("Dry run only. Re-run with --apply to write target rows.");
      return;
    }

    targetPool = new Pool({
      connectionString: getTargetDatabaseUrl(),
      max: 1,
    });
    const targetClient = await targetPool.connect();
    try {
      await targetClient.query("BEGIN");
      await targetClient.query(
        `
          SELECT
            set_config('app.current_org_id', $1, true),
            set_config('app.current_operator_id', '', true),
            set_config('app.is_service_role', 'true', true)
        `,
        [internalOrgId]
      );

      const authOrganizationId = await upsertInternalOrganizations(targetClient);

      for (const identity of identities) {
        await upsertMigratedIdentity(targetClient, identity, authOrganizationId);
      }

      await targetClient.query("COMMIT");
    } catch (error) {
      await targetClient.query("ROLLBACK");
      throw error;
    } finally {
      targetClient.release();
    }

    if (sendResets) {
      await requestPasswordResetEmails(identities);
    }

    console.log(
      `Migrated ${identities.length} operator accounts into Better Auth/PostgreSQL.`
    );
  } finally {
    await sourcePool.end();
    await targetPool?.end();
  }
}

async function fetchLegacyAuthRows(pool: Pool) {
  const { rows } = await pool.query<{
    legacy_user_id: string;
    email: string;
    email_verified: boolean;
    created_at: Date;
    updated_at: Date | null;
    profile_name: string | null;
    profile_avatar_url: string | null;
    profile_role: string | null;
    profile_mail: string | null;
    raw_user_metadata: Record<string, unknown> | null;
  }>(`
    SELECT
      au.id::text AS legacy_user_id,
      au.email::text AS email,
      (au.email_confirmed_at IS NOT NULL) AS email_verified,
      au.created_at,
      au.updated_at,
      to_jsonb(p)->>'full_name' AS profile_name,
      to_jsonb(p)->>'avatar_url' AS profile_avatar_url,
      to_jsonb(p)->>'role' AS profile_role,
      to_jsonb(p)->>'mail' AS profile_mail,
      au.raw_user_meta_data AS raw_user_metadata
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE au.email IS NOT NULL
    ORDER BY au.created_at ASC
  `);

  return rows.map(
    (row): LegacySupabaseAuthRow => ({
      legacyUserId: row.legacy_user_id,
      email: row.email,
      emailVerified: row.email_verified,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      profileName: row.profile_name,
      profileAvatarUrl: row.profile_avatar_url,
      profileRole: row.profile_role,
      profileMail: row.profile_mail,
      rawUserMetadata: row.raw_user_metadata,
    })
  );
}

async function upsertInternalOrganizations(client: PoolClient) {
  await client.query(
    `
      INSERT INTO organization (
        id, kind, legal_name, display_name, website, jurisdiction, state, org_id
      )
      VALUES (
        $1, 'internal', 'Caudals Operations', 'Caudals Ops',
        'https://caudals.com', 'ES', 'active', $1
      )
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind,
        legal_name = EXCLUDED.legal_name,
        display_name = EXCLUDED.display_name,
        website = EXCLUDED.website,
        jurisdiction = EXCLUDED.jurisdiction,
        state = 'active',
        org_id = EXCLUDED.org_id,
        deleted_at = NULL
    `,
    [internalOrgId]
  );

  const { rows } = await client.query<{ id: string }>(
    `
      INSERT INTO "auth_organization" ("id", "name", "slug", "logo", "createdAt", "metadata")
      VALUES ($1, 'Caudals Operations', 'caudals-operations', NULL, now(), NULL)
      ON CONFLICT ("slug") DO UPDATE SET
        "name" = EXCLUDED."name",
        "logo" = EXCLUDED."logo",
        "metadata" = EXCLUDED."metadata"
      RETURNING "id"
    `,
    [defaultAuthOrganizationId]
  );

  return rows[0]?.id ?? defaultAuthOrganizationId;
}

async function upsertMigratedIdentity(
  client: PoolClient,
  identity: MigratedOperatorIdentity,
  authOrganizationId: string
) {
  const passwordHash = await hashPassword(randomBytes(48).toString("hex"));
  const skillProfile = {
    migration: "supabase-auth",
    legacy_supabase_user_id: identity.legacyUserId,
    legacy_supabase_role: identity.legacyRole,
    force_password_reset: true,
  };
  const authUserId = await upsertAuthUser(client, identity);
  const operatorId = await upsertOperator(client, identity, skillProfile);

  await client.query(
    `
      INSERT INTO "auth_account" (
        "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, 'credential', $2, $3, $4, $5)
      ON CONFLICT ("id") DO UPDATE SET
        "accountId" = EXCLUDED."accountId",
        "providerId" = 'credential',
        "userId" = EXCLUDED."userId",
        "password" = EXCLUDED."password",
        "updatedAt" = EXCLUDED."updatedAt"
    `,
    [
      identity.authAccountId,
      authUserId,
      passwordHash,
      identity.createdAt,
      identity.updatedAt,
    ]
  );

  await client.query(
    `
      INSERT INTO "auth_member" ("id", "organizationId", "userId", "role", "createdAt")
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT ("id") DO UPDATE SET
        "organizationId" = EXCLUDED."organizationId",
        "userId" = EXCLUDED."userId",
        "role" = EXCLUDED."role"
    `,
    [
      identity.authMemberId,
      authOrganizationId,
      authUserId,
      identity.operatorRole === "admin" ? "admin" : "member",
      identity.createdAt,
    ]
  );

  await insertMigrationAuditEvent(client, identity, operatorId, authUserId);
}

async function upsertAuthUser(
  client: PoolClient,
  identity: MigratedOperatorIdentity
) {
  const { rows } = await client.query<{ id: string }>(
    `
      INSERT INTO "auth_user" (
        "id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "twoFactorEnabled"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, false)
      ON CONFLICT ("email") DO UPDATE SET
        "name" = EXCLUDED."name",
        "emailVerified" = EXCLUDED."emailVerified",
        "image" = EXCLUDED."image",
        "updatedAt" = EXCLUDED."updatedAt",
        "twoFactorEnabled" = false
      RETURNING "id"
    `,
    [
      identity.authUserId,
      identity.name,
      identity.email,
      identity.emailVerified,
      identity.image,
      identity.createdAt,
      identity.updatedAt,
    ]
  );

  return rows[0]?.id ?? identity.authUserId;
}

async function upsertOperator(
  client: PoolClient,
  identity: MigratedOperatorIdentity,
  skillProfile: Record<string, unknown>
) {
  const { rows } = await client.query<{ id: string }>(
    `
      INSERT INTO "operator" (
        id, email, name, role, skill_profile, mfa_required, webauthn_required,
        state, created_at, updated_at, org_id
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb, false, false,
        'active', $6, $7, $8
      )
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        skill_profile = "operator".skill_profile || EXCLUDED.skill_profile,
        mfa_required = false,
        webauthn_required = false,
        state = 'active',
        updated_at = EXCLUDED.updated_at,
        org_id = EXCLUDED.org_id,
        deleted_at = NULL
      RETURNING id
    `,
    [
      identity.operatorId,
      identity.email,
      identity.name,
      identity.operatorRole,
      JSON.stringify(skillProfile),
      identity.createdAt,
      identity.updatedAt,
      internalOrgId,
    ]
  );

  return rows[0]?.id ?? identity.operatorId;
}

async function insertMigrationAuditEvent(
  client: PoolClient,
  identity: MigratedOperatorIdentity,
  operatorId: string,
  authUserId: string
) {
  const auditId = deterministicPrefixedId(
    "ae",
    `operator_account.migrated:${identity.legacyUserId}`
  );

  await client.query(
    `
      INSERT INTO audit_event (
        id, org_id, actor_id, action, target_type, target_id, metadata
      )
      SELECT
        $1,
        $2,
        $3,
        'operator_account.migrated',
        'operator',
        $3,
        $4::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_event WHERE id = $1
      )
    `,
    [
      auditId,
      internalOrgId,
      operatorId,
      JSON.stringify({
        legacy_supabase_user_id: identity.legacyUserId,
        legacy_supabase_role: identity.legacyRole,
        auth_user_id: authUserId,
        force_password_reset: true,
      }),
    ]
  );
}

async function requestPasswordResetEmails(
  identities: MigratedOperatorIdentity[]
) {
  const baseUrl =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    throw new Error(
      "BETTER_AUTH_URL, NEXT_PUBLIC_BETTER_AUTH_URL, or NEXT_PUBLIC_APP_URL is required when sending reset emails"
    );
  }

  const url = new URL("/api/auth/request-password-reset", baseUrl);

  for (const identity of identities) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: identity.email,
        redirectTo: "/auth/reset-password",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Password-reset request failed with HTTP ${response.status}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
