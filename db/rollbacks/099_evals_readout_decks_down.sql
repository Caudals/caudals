-- Rollback for db/migrations/099_evals_readout_decks.sql.
--
-- Drops the L-35 readout tables, the readout export kind and its column. It
-- refuses while any readout deck, presenter note or readout PDF job exists:
-- decks and notes are operator work, and readout jobs point at stored PDFs.
-- Switch READOUT_MODE_ENABLED off and repair forward instead. It must run as
-- a role that bypasses row-level security, or the counts could not see every
-- row. One transaction, so the guard holds even without ON_ERROR_STOP.
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
  IF to_regclass('evals.readout_deck') IS NOT NULL THEN
    EXECUTE 'SELECT (SELECT count(*) FROM evals.readout_deck) + (SELECT count(*) FROM evals.readout_note)
      + (SELECT count(*) FROM evals.export_job WHERE kind = ''readout_pdf'')' INTO remaining;
  END IF;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % readout deck, note or readout PDF rows exist. Switch READOUT_MODE_ENABLED off and repair forward instead.', remaining;
  END IF;
END $$;

DROP INDEX IF EXISTS evals.export_job_readout;
ALTER TABLE evals.export_job DROP CONSTRAINT IF EXISTS export_job_readout_unshared;
ALTER TABLE evals.export_job DROP CONSTRAINT IF EXISTS export_job_readout;
ALTER TABLE evals.export_job DROP COLUMN IF EXISTS readout;
ALTER TABLE evals.export_job DROP CONSTRAINT IF EXISTS export_job_kind_check;
ALTER TABLE evals.export_job ADD CONSTRAINT export_job_kind_check CHECK (kind IN ('pdf','csv','cef','docx'));
DROP TABLE IF EXISTS evals.readout_note;
DROP TABLE IF EXISTS evals.readout_deck;
DROP FUNCTION IF EXISTS evals.is_readout_operator();

COMMIT;
