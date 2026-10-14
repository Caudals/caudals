-- Rollback for db/migrations/104_evals_publication_consent.sql.
--
-- Refuses while any publication consent, public result page, snapshot sector
-- or sector index edition exists: a consent is the written record of what an
-- owner agreed to (and when they withdrew it), and a page or edition is the
-- record of what Caudals published. Switch PUBLIC_RESULTS_ENABLED off,
-- redeploy a compatible image and repair forward instead. It must run as a
-- role that bypasses row-level security, or the counts below could not see
-- every row. One transaction, so the guard holds even when psql runs without
-- ON_ERROR_STOP.
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
  FOREACH name IN ARRAY ARRAY['evals.publication_consent', 'evals.public_result_page',
    'evals.prospect_snapshot_sector', 'evals.sector_index_publication'] LOOP
    IF to_regclass(name) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %s', name) INTO counted;
      remaining := remaining + counted;
    END IF;
  END LOOP;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % publication rows exist. Repair forward instead.', remaining;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.public_sector_index(text);
DROP FUNCTION IF EXISTS evals.withdraw_sector_index_publication(uuid, text);
DROP FUNCTION IF EXISTS evals.record_sector_index_publication(text, text, jsonb, text, text, text, date);
DROP FUNCTION IF EXISTS evals.sector_index_inputs(text);
DROP FUNCTION IF EXISTS evals.quarter_bounds(text);
DROP FUNCTION IF EXISTS evals.set_snapshot_index_sector(uuid, text);
DROP FUNCTION IF EXISTS evals.public_result_page_view(text);
DROP FUNCTION IF EXISTS evals.unpublish_result_page(uuid, text);
DROP FUNCTION IF EXISTS evals.publish_result_page(uuid, text, text);
DROP FUNCTION IF EXISTS evals.revoke_publication_consent(uuid, uuid, text);
DROP FUNCTION IF EXISTS evals.record_publication_consent(uuid, uuid, boolean, boolean, text, text, text, text, text, text, text, text, text, text, timestamptz);
DROP TABLE IF EXISTS evals.sector_index_publication;
DROP TABLE IF EXISTS evals.prospect_snapshot_sector;
DROP TABLE IF EXISTS evals.public_result_page;
DROP TABLE IF EXISTS evals.publication_consent;
DROP FUNCTION IF EXISTS evals.guard_sector_index_publication();
DROP FUNCTION IF EXISTS evals.guard_public_result_page();
DROP FUNCTION IF EXISTS evals.guard_publication_consent();
DELETE FROM public.evals_migration_history WHERE name = '104_evals_publication_consent.sql';

COMMIT;
