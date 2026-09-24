-- Restore the original global deduplication constraint only when retry history permits it.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM evals.generation_batch
    GROUP BY org_id,evaluation_id,step_kind,input_hash,version
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot restore global generation-batch uniqueness after repeated source generations';
  END IF;
END $$;
DROP INDEX IF EXISTS evals.generation_batch_legacy_hash_version;
ALTER TABLE evals.generation_batch
  ADD CONSTRAINT generation_batch_org_id_evaluation_id_step_kind_input_hash__key
  UNIQUE(org_id,evaluation_id,step_kind,input_hash,version);
COMMIT;
