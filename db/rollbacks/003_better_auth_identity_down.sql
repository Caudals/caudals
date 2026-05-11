-- Rollback for db/migrations/003_better_auth_identity.sql.

DROP TABLE IF EXISTS "auth_passkey" CASCADE;
DROP TABLE IF EXISTS "auth_two_factor" CASCADE;
DROP TABLE IF EXISTS "auth_invitation" CASCADE;
DROP TABLE IF EXISTS "auth_member" CASCADE;
DROP TABLE IF EXISTS "auth_team_member" CASCADE;
DROP TABLE IF EXISTS "auth_team" CASCADE;
DROP TABLE IF EXISTS "auth_organization" CASCADE;
DROP TABLE IF EXISTS "auth_verification" CASCADE;
DROP TABLE IF EXISTS "auth_account" CASCADE;
DROP TABLE IF EXISTS "auth_session" CASCADE;
DROP TABLE IF EXISTS "auth_user" CASCADE;
