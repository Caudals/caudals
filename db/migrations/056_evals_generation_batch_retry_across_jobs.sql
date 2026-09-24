-- Permit a new automatic-generation job to reuse the same source extraction input.
-- Keep the original deduplication contract for legacy batches without a job ID.
BEGIN;
ALTER TABLE evals.generation_batch
  DROP CONSTRAINT IF EXISTS generation_batch_org_id_evaluation_id_step_kind_input_hash__key;
CREATE UNIQUE INDEX generation_batch_legacy_hash_version
  ON evals.generation_batch(org_id,evaluation_id,step_kind,input_hash,version)
  WHERE generation_job_id IS NULL;
COMMIT;
