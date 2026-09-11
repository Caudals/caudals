-- Rollback for db/migrations/026_security_review_library.sql.
--
-- One transaction, so the guard still holds when psql runs without
-- ON_ERROR_STOP.

BEGIN;

DO $$
DECLARE
  active_rows bigint := 0;
BEGIN
  -- Dynamic SQL: a static reference would fail to plan once the table is gone.
  IF to_regclass('public.security_review_artifact') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM security_review_artifact
      WHERE deleted_at IS NULL
        AND (
          artifact_key NOT IN (
            'buyer_supplier_data_isolation',
            'dataset_release_evidence',
            'incident_routing',
            'formal_review_gates',
            'security_posture_summary',
            'standard_dpa_review_path',
            'soc2_iso_scope',
            'dataset_provenance_pii_notes',
            'incident_response_runbooks',
            'security_questionnaire_answers'
          )
          OR state <> 'published'
        )
    $sql$
      INTO active_rows;
  END IF;

  IF active_rows > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: non-seed security_review_artifact rows exist';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.security_review_artifact') IS NOT NULL THEN
    DROP POLICY IF EXISTS security_review_artifact_operator_write
      ON security_review_artifact;
    DROP POLICY IF EXISTS security_review_artifact_public_read
      ON security_review_artifact;
    DROP TRIGGER IF EXISTS security_review_artifact_touch_updated_at
      ON security_review_artifact;
  END IF;
END;
$$;

DROP INDEX IF EXISTS security_review_artifact_org_type_idx;
DROP INDEX IF EXISTS security_review_artifact_public_idx;
DROP TABLE IF EXISTS security_review_artifact;

COMMIT;
