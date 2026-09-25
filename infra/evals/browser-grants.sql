-- Apply as migration owner after provisioning a dedicated evals_browser LOGIN
-- with NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE. Its network must not
-- reach PostgreSQL except through this login, and must not reach private app,
-- metadata, DGX, Docker or object-storage endpoints.
GRANT USAGE ON SCHEMA evals TO evals_browser;
GRANT SELECT ON evals.target,evals.target_revision,evals.website_recipe_candidate,
 evals.website_recipe_revision,evals.connection_check,evals.case_unit,
 evals.execution_workflow,evals.workflow_step,evals.outbox_event,
 evals.target_attempt,evals.secret_record,evals.secret_version,evals.run,
 evals.execution_result,evals.browser_login_session TO evals_browser;
GRANT INSERT ON evals.website_recipe_revision,evals.target_revision,
 evals.target_attempt,evals.observation,evals.execution_event,evals.outbox_event TO evals_browser;
GRANT UPDATE(status,reason_code,document,discovery_snapshot,updated_at)
 ON evals.website_recipe_candidate TO evals_browser;
GRANT UPDATE(status,capability_report,error_code,probe_evidence,completed_at)
 ON evals.connection_check TO evals_browser;
GRANT UPDATE(status,phase,reason_code,updated_at) ON evals.execution_workflow TO evals_browser;
GRANT UPDATE(status,fence,lease_owner,lease_until,reason_code,updated_at)
 ON evals.workflow_step TO evals_browser;
GRANT UPDATE(delivered_at) ON evals.outbox_event TO evals_browser;
GRANT UPDATE(status,attempt_id,reason_code,updated_at) ON evals.case_unit TO evals_browser;
GRANT UPDATE(status,reason_code,dispatched_at,finished_at) ON evals.target_attempt TO evals_browser;
GRANT UPDATE(status,phase,reason_code,updated_at) ON evals.run TO evals_browser;
GRANT USAGE ON SEQUENCE evals.execution_event_id_seq TO evals_browser;
GRANT EXECUTE ON FUNCTION evals.org_id(),evals.actor_id() TO evals_browser;

-- Public website context capture runs in the same isolated browser executor.
GRANT SELECT ON evals.website_source_job TO evals_browser;
GRANT UPDATE(status,attempt_count,captured_text,reason_code,updated_at)
 ON evals.website_source_job TO evals_browser;

-- Reapply after migration 046 when provisioning or rotating the browser login.
DO $$ BEGIN
 IF to_regclass('evals.target_invocation_ledger') IS NOT NULL THEN
  GRANT SELECT,INSERT ON evals.target_invocation_ledger TO evals_browser;
  GRANT UPDATE(state,reported_input_tokens,reported_output_tokens,
    reported_cost_amount,reported_cost_currency,reported_cost_provenance,
    reason_code,dispatched_at,finished_at)
    ON evals.target_invocation_ledger TO evals_browser;
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('evals.target_invocation_call') IS NOT NULL THEN
  GRANT SELECT,INSERT ON evals.target_invocation_call TO evals_browser;
  GRANT UPDATE(state,reported_input_tokens,reported_output_tokens,
    reported_cost_amount,reported_cost_currency,reported_cost_provenance,
    reason_code,finished_at) ON evals.target_invocation_call TO evals_browser;
 END IF;
END $$;
