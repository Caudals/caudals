-- Rollback for db/migrations/086_evals_onboarding.sql.
--
-- Refuses while any onboarding state, automatic start or help request exists:
-- they are customer choices, the provenance of generation jobs and ops tasks.
-- Switch ONBOARDING_AUTOSTART off, redeploy a compatible image and repair
-- forward instead. It must run as a role that bypasses row-level security, or
-- the counts below could not see every row. One transaction, so the guard
-- holds even when psql runs without ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
  remaining bigint := 0;
  counted bigint;
  name text;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  -- Dynamic SQL: a static reference would fail to plan once a table is gone.
  FOREACH name IN ARRAY ARRAY['evals.workspace_onboarding', 'evals.onboarding_autostart', 'evals.onboarding_help_request'] LOOP
    IF to_regclass(name) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %s', name) INTO counted;
      remaining := remaining + counted;
    END IF;
  END LOOP;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % onboarding rows exist. Repair forward instead.', remaining;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.resolve_onboarding_help(uuid);
DROP FUNCTION IF EXISTS evals.mark_onboarding_help_notified(uuid, uuid);
DROP FUNCTION IF EXISTS evals.request_onboarding_help(uuid, uuid, text);
DROP FUNCTION IF EXISTS evals.onboarding_autostart_due();
DROP FUNCTION IF EXISTS evals.workspace_onboarding_state(uuid);
DROP FUNCTION IF EXISTS evals.update_workspace_onboarding(uuid, text, text, text);
DROP FUNCTION IF EXISTS evals.start_workspace_onboarding(uuid);
DROP FUNCTION IF EXISTS evals.onboarding_member(uuid, text[]);
DROP TABLE IF EXISTS evals.onboarding_help_request;
DROP TABLE IF EXISTS evals.onboarding_autostart;
DROP TABLE IF EXISTS evals.workspace_onboarding;
DELETE FROM public.evals_migration_history WHERE name = '086_evals_onboarding.sql';

COMMIT;
