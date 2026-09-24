-- Forward repair is preferred if profile questions have already been persisted.
BEGIN;
REVOKE UPDATE (question, critical) ON TABLE evals.context_question FROM evals_runtime;
COMMIT;
