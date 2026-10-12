-- Reverts 107 only while no account holds lockout state. A non-zero failure
-- count or a lock time is live security state: wait for it to clear (locks
-- last 15 minutes; a successful verification resets the count) or repair
-- forward instead of discarding it.
BEGIN;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'auth_two_factor' AND column_name = 'lockedUntil'
  ) AND EXISTS (
    SELECT 1 FROM public.auth_two_factor
    WHERE "lockedUntil" IS NOT NULL OR COALESCE("failedVerificationCount", 0) <> 0
  ) THEN
    RAISE EXCEPTION 'auth_two_factor rollback refused: accounts hold lockout state; repair forward';
  END IF;
END $$;
ALTER TABLE public.auth_two_factor
  DROP COLUMN IF EXISTS "lockedUntil",
  DROP COLUMN IF EXISTS "failedVerificationCount";
DELETE FROM public.evals_migration_history WHERE name = '107_auth_two_factor_lockout.sql';
COMMIT;
