-- Better Auth identity schema for the Phase 1 PostgreSQL migration.
-- Keeps auth-owned tables prefixed so they do not collide with operator-domain tables.

CREATE TABLE "auth_user" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'au')),
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  "image" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "twoFactorEnabled" boolean
);

CREATE TABLE "auth_session" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'as')),
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "auth_user" ("id") ON DELETE CASCADE,
  "activeOrganizationId" text,
  "activeTeamId" text
);

CREATE TABLE "auth_account" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'aa')),
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "auth_user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE "auth_verification" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'av')),
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "auth_organization" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'ao')),
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "logo" text,
  "createdAt" timestamptz NOT NULL,
  "metadata" text
);

CREATE TABLE "auth_team" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'at')),
  "name" text NOT NULL,
  "organizationId" text NOT NULL REFERENCES "auth_organization" ("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz
);

CREATE TABLE "auth_team_member" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'ab')),
  "teamId" text NOT NULL REFERENCES "auth_team" ("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "auth_user" ("id") ON DELETE CASCADE,
  "createdAt" timestamptz
);

CREATE TABLE "auth_member" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'am')),
  "organizationId" text NOT NULL REFERENCES "auth_organization" ("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "auth_user" ("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "createdAt" timestamptz NOT NULL
);

CREATE TABLE "auth_invitation" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'ai')),
  "organizationId" text NOT NULL REFERENCES "auth_organization" ("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text,
  "teamId" text,
  "status" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "inviterId" text NOT NULL REFERENCES "auth_user" ("id") ON DELETE CASCADE
);

CREATE TABLE "auth_two_factor" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'af')),
  "secret" text NOT NULL,
  "backupCodes" text NOT NULL,
  "userId" text NOT NULL REFERENCES "auth_user" ("id") ON DELETE CASCADE,
  "verified" boolean
);

CREATE TABLE "auth_passkey" (
  "id" text NOT NULL PRIMARY KEY CHECK (app_private.assert_ulid_prefixed("id", 'ak')),
  "name" text,
  "publicKey" text NOT NULL,
  "userId" text NOT NULL REFERENCES "auth_user" ("id") ON DELETE CASCADE,
  "credentialID" text NOT NULL,
  "counter" integer NOT NULL,
  "deviceType" text NOT NULL,
  "backedUp" boolean NOT NULL,
  "transports" text,
  "createdAt" timestamptz,
  "aaguid" text
);

CREATE INDEX "auth_session_userId_idx" ON "auth_session" ("userId");
CREATE INDEX "auth_account_userId_idx" ON "auth_account" ("userId");
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" ("identifier");
CREATE UNIQUE INDEX "auth_organization_slug_uidx" ON "auth_organization" ("slug");
CREATE INDEX "auth_team_organizationId_idx" ON "auth_team" ("organizationId");
CREATE INDEX "auth_team_member_teamId_idx" ON "auth_team_member" ("teamId");
CREATE INDEX "auth_team_member_userId_idx" ON "auth_team_member" ("userId");
CREATE INDEX "auth_member_organizationId_idx" ON "auth_member" ("organizationId");
CREATE INDEX "auth_member_userId_idx" ON "auth_member" ("userId");
CREATE INDEX "auth_invitation_organizationId_idx" ON "auth_invitation" ("organizationId");
CREATE INDEX "auth_invitation_email_idx" ON "auth_invitation" ("email");
CREATE INDEX "auth_two_factor_secret_idx" ON "auth_two_factor" ("secret");
CREATE INDEX "auth_two_factor_userId_idx" ON "auth_two_factor" ("userId");
CREATE INDEX "auth_passkey_userId_idx" ON "auth_passkey" ("userId");
CREATE INDEX "auth_passkey_credentialID_idx" ON "auth_passkey" ("credentialID");
