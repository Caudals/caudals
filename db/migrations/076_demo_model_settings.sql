-- Platform-wide preferred demo model. Keep the existing fallback chain until
-- an administrator explicitly chooses a model. Forward repair only.
BEGIN;
CREATE TABLE demo.model_setting (
  provider_key text PRIMARY KEY CHECK (provider_key ~ '^[0-9a-f]{64}$'),
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 200),
  updated_by text NOT NULL REFERENCES public.auth_user(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON demo.model_setting FROM PUBLIC;
GRANT USAGE ON SCHEMA demo TO evals_execution_admin;
GRANT SELECT ON demo.model_setting TO evals_runtime;
GRANT SELECT, INSERT, UPDATE ON demo.model_setting TO evals_execution_admin;
COMMIT;
