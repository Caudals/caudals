-- Rollback for db/migrations/100_evals_sector_packs.sql.
--
-- Drops the L-25 sector pack tables, the workspace library settings, the
-- monthly source refreshes and question proposals, and their functions. It
-- refuses while any of those tables holds rows: packs and reviews are expert
-- work, links and proposals are test-set provenance. Switch
-- SECTOR_PACKS_ENABLED off and repair forward instead. It must run as a role
-- that bypasses row-level security, or the counts could not see every row.
-- One transaction, so the guard holds even without ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
  remaining bigint := 0;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  IF to_regclass('evals.sector_pack') IS NOT NULL THEN
    EXECUTE 'SELECT (SELECT count(*) FROM evals.sector_pack) + (SELECT count(*) FROM evals.sector_pack_version)
      + (SELECT count(*) FROM evals.sector_pack_item) + (SELECT count(*) FROM evals.sector_pack_case_link)
      + (SELECT count(*) FROM evals.workspace_library_setting) + (SELECT count(*) FROM evals.source_refresh)
      + (SELECT count(*) FROM evals.question_proposal)' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % sector pack, library setting, refresh or proposal rows exist. Switch SECTOR_PACKS_ENABLED off and repair forward instead.', remaining;
  END IF;
END $$;

DROP FUNCTION IF EXISTS evals.decide_question_proposal(uuid, text, uuid);
DROP TABLE IF EXISTS evals.question_proposal;
DROP FUNCTION IF EXISTS evals.guard_question_proposal();
DROP TABLE IF EXISTS evals.source_refresh;
DROP FUNCTION IF EXISTS evals.monthly_questions_due();
DROP FUNCTION IF EXISTS evals.set_workspace_library_setting(text, boolean, boolean);
DROP TABLE IF EXISTS evals.workspace_library_setting;
DROP FUNCTION IF EXISTS evals.sector_pack_item_stats(uuid);
DROP INDEX IF EXISTS evals.case_unit_case_revision;
DROP TABLE IF EXISTS evals.sector_pack_case_link;
DROP FUNCTION IF EXISTS evals.guard_sector_pack_case_link();
DROP FUNCTION IF EXISTS evals.sector_pack_version_transition(uuid, text);
DROP FUNCTION IF EXISTS evals.sector_pack_item_review(uuid, text, text);
DROP FUNCTION IF EXISTS evals.sector_pack_item_remove(uuid);
DROP FUNCTION IF EXISTS evals.sector_pack_item_save(uuid, jsonb, text);
DROP FUNCTION IF EXISTS evals.sector_pack_version_open(text, text, uuid);
DROP FUNCTION IF EXISTS evals.sector_pack_save(text, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS evals.sector_pack_item_hash(evals.sector_pack_item);
DROP TABLE IF EXISTS evals.sector_pack_item;
DROP FUNCTION IF EXISTS evals.guard_sector_pack_item();
DO $$ BEGIN
  IF to_regclass('evals.sector_pack') IS NOT NULL THEN EXECUTE 'DROP POLICY IF EXISTS sector_pack_read ON evals.sector_pack'; END IF;
END $$;
DROP TABLE IF EXISTS evals.sector_pack_version;
DROP FUNCTION IF EXISTS evals.guard_sector_pack_version();
DROP TABLE IF EXISTS evals.sector_pack;
DROP FUNCTION IF EXISTS evals.sector_pack_writer(boolean);
DROP FUNCTION IF EXISTS evals.can_author_sector_packs();
DROP FUNCTION IF EXISTS evals.sector_pack_expert_profile(boolean);

COMMIT;
