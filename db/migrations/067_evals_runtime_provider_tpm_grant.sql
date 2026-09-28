-- Generation sizes source material against the registered tokens-per-minute
-- limit. This catalog field is non-secret and required by the web runtime.
BEGIN;
GRANT SELECT (tpm) ON TABLE evals.provider_revision TO evals_runtime;
COMMIT;
