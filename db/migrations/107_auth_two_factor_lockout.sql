-- Two-factor account lockout columns (launch package L-08, spec P-43).
--
-- better-auth 1.6's two-factor plugin counts failed TOTP and backup-code
-- attempts per account and locks verification for 15 minutes after ten in a
-- row. It writes these two columns on enrolment and on every verification;
-- without them enrolment fails, so no platform admin or operator could turn
-- on TOTP. 003_better_auth_identity.sql predates them.
--
-- Forward repair: additive only. The rollback refuses while any account holds
-- live lockout state.
BEGIN;
ALTER TABLE public.auth_two_factor
  ADD COLUMN IF NOT EXISTS "failedVerificationCount" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" timestamptz;
COMMIT;
