-- Permit automatic generation to refresh only generated context question text.
BEGIN;
GRANT UPDATE (question, critical) ON TABLE evals.context_question TO evals_runtime;
COMMIT;
