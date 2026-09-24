-- The web runtime needs only non-secret model catalog fields for the
-- workspace generation projection. Endpoints, provider capabilities, token
-- prices and credential data remain behind the worker/admin roles.
BEGIN;
GRANT SELECT (id, adapter, model_id, context_limit, output_limit)
  ON TABLE evals.provider_revision TO evals_runtime;
GRANT SELECT (id, provider_revision_id, currency)
  ON TABLE evals.price_revision TO evals_runtime;
COMMIT;
