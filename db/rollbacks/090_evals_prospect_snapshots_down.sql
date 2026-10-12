-- Rollback for db/migrations/090_evals_prospect_snapshots.sql.
--
-- Drops the L-21 snapshot and digest objects. It refuses while any prospect
-- snapshot, snapshot share or digest send exists: those rows are the testing
-- basis record and the send history. Switch PROSPECT_SNAPSHOTS_ENABLED and
-- OPS_DIGEST_ENABLED off and repair forward instead. It must run as a role
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
  IF to_regclass('evals.prospect_snapshot') IS NOT NULL THEN
    EXECUTE 'SELECT (SELECT count(*) FROM evals.prospect_snapshot) + (SELECT count(*) FROM evals.ops_digest_send)
      + (SELECT count(*) FROM evals.share_grant WHERE label IS NOT NULL)' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % prospect snapshot, snapshot share or digest rows exist. Switch the flags off and repair forward instead.', remaining;
  END IF;
END $$;

DROP TRIGGER IF EXISTS enforce_prospect_snapshot_share ON evals.share_grant;
DROP TRIGGER IF EXISTS enforce_prospect_snapshot_run ON evals.run;
DROP TRIGGER IF EXISTS guard_external_snapshot_basis ON evals.authorization_record;
DROP FUNCTION IF EXISTS evals.enforce_prospect_snapshot_share();
DROP FUNCTION IF EXISTS evals.enforce_prospect_snapshot_run();
DROP FUNCTION IF EXISTS evals.guard_external_snapshot_basis();
DROP FUNCTION IF EXISTS evals.ops_digest_data(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS evals.finish_ops_digest(date, boolean, text, text, jsonb);
DROP FUNCTION IF EXISTS evals.claim_ops_digest(date);
DROP FUNCTION IF EXISTS evals._digest_actor();
DROP FUNCTION IF EXISTS evals.ops_workspace_details();
DROP FUNCTION IF EXISTS evals.create_prospect_snapshot(text,text,text,text,text,text,text,text,text,jsonb,jsonb,integer);
DROP FUNCTION IF EXISTS evals.prospect_sandbox(uuid);
DROP TABLE IF EXISTS evals.ops_digest_send;
DROP TABLE IF EXISTS evals.prospect_snapshot_day;
DROP TABLE IF EXISTS evals.prospect_snapshot;
DROP FUNCTION IF EXISTS evals.is_platform_staff();
ALTER TABLE evals.share_grant DROP COLUMN IF EXISTS label;

COMMIT;
