-- Preserve generation history while allowing a new frozen step after a proven pre-dispatch failure.
-- Roll back only before any retry versions exist: drop the version index and restore the
-- original three-column unique index. After retries create multiple versions, forward repair
-- is safer because recreating the old index would discard valid retry history.
BEGIN;
DROP INDEX evals.generation_batch_job_step;
CREATE UNIQUE INDEX generation_batch_job_step_version
  ON evals.generation_batch(org_id,generation_job_id,step_kind,version)
  WHERE generation_job_id IS NOT NULL;
COMMIT;
