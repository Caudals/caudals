-- Reverts 075. Drops every demo run and pending sign-up link; accounts and
-- workspaces already created through self-serve sign-up stay, and keep
-- their entitlement row without the plan limits.
BEGIN;
DROP FUNCTION IF EXISTS evals.enroll_self_serve(text, text, text, text, text);
DROP FUNCTION IF EXISTS evals.self_serve_signup_lookup(text);
DROP FUNCTION IF EXISTS evals.request_self_serve_signup(text, text, text, uuid, text);
DROP TABLE IF EXISTS evals.self_serve_signup;
DROP TRIGGER IF EXISTS enforce_plan_tests ON evals.generation_job;
DROP TRIGGER IF EXISTS enforce_plan_runs ON evals.run;
DROP TRIGGER IF EXISTS enforce_plan_systems ON evals.target;
DROP FUNCTION IF EXISTS evals.enforce_plan_tests();
DROP FUNCTION IF EXISTS evals.enforce_plan_runs();
DROP FUNCTION IF EXISTS evals.enforce_plan_systems();
ALTER TABLE evals.workspace_entitlement
  DROP COLUMN IF EXISTS max_runs_per_month,
  DROP COLUMN IF EXISTS max_tests_per_set,
  DROP COLUMN IF EXISTS max_systems,
  DROP COLUMN IF EXISTS plan;
DROP SCHEMA IF EXISTS demo CASCADE;
DELETE FROM public.evals_migration_history WHERE name = '075_demo_and_self_serve.sql';
COMMIT;
