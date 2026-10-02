-- Refuses while any job asked for more than 20 tests: shrinking the limit would fail anyway.
BEGIN;
REVOKE UPDATE (context) ON TABLE evals.context_question FROM evals_runtime;
ALTER TABLE evals.context_question DROP COLUMN context;
ALTER TABLE evals.generation_job DROP COLUMN draft_rounds, DROP COLUMN draft_cases, DROP COLUMN complexity;
ALTER TABLE evals.generation_job DROP CONSTRAINT generation_job_requested_case_count_check;
ALTER TABLE evals.generation_job ADD CONSTRAINT generation_job_requested_case_count_check
  CHECK (requested_case_count BETWEEN 1 AND 20);
COMMIT;
