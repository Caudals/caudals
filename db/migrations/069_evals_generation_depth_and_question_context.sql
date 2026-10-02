-- Larger, configurable automatic test sets and context questions that explain themselves.
--
-- * generation_job.requested_case_count now allows up to 200 tests; drafting
--   runs in rounds, so draft_cases keeps the source-validated cases accepted so
--   far and draft_rounds counts the model calls that produced them.
-- * generation_job.complexity steers the difficulty mix of the coverage plan.
-- * context_question.context holds why a question is asked and suggested
--   answers, so the customer can answer (or skip) without guessing.
BEGIN;

ALTER TABLE evals.generation_job DROP CONSTRAINT IF EXISTS generation_job_requested_case_count_check;
ALTER TABLE evals.generation_job ADD CONSTRAINT generation_job_requested_case_count_check
  CHECK (requested_case_count BETWEEN 1 AND 200);
ALTER TABLE evals.generation_job
  ADD COLUMN complexity text NOT NULL DEFAULT 'balanced' CHECK (complexity IN ('foundational','balanced','expert')),
  ADD COLUMN draft_cases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(draft_cases) = 'array'),
  ADD COLUMN draft_rounds integer NOT NULL DEFAULT 0 CHECK (draft_rounds BETWEEN 0 AND 40);

ALTER TABLE evals.context_question ADD COLUMN context jsonb;
GRANT UPDATE (context) ON TABLE evals.context_question TO evals_runtime;

COMMIT;
