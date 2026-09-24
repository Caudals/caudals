-- If these grants must be withdrawn, first disable automatic generation for
-- every workspace and remove its generation routes.
BEGIN;
REVOKE SELECT (id, adapter, model_id, context_limit, output_limit)
  ON TABLE evals.provider_revision FROM evals_runtime;
REVOKE SELECT (id, provider_revision_id, currency)
  ON TABLE evals.price_revision FROM evals_runtime;
COMMIT;
