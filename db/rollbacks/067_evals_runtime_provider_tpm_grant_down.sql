BEGIN;
REVOKE SELECT (tpm) ON TABLE evals.provider_revision FROM evals_runtime;
COMMIT;
