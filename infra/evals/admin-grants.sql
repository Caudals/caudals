-- Provision evals_execution_admin separately: LOGIN NOSUPERUSER NOBYPASSRLS,
-- no ownership and NOT a member of evals_runtime. Actor must be platform_admin.
GRANT USAGE ON SCHEMA evals TO evals_execution_admin;
GRANT EXECUTE ON FUNCTION evals.org_id(),evals.actor_id(),evals.is_admin() TO evals_execution_admin;
GRANT SELECT ON evals.platform_role,evals.membership,evals.workspace TO evals_execution_admin;
GRANT INSERT ON evals.audit_event TO evals_execution_admin;
GRANT SELECT,INSERT,UPDATE ON evals.provider_account,evals.provider_health,evals.provider_slot,evals.secret_record,evals.execution_budget,evals.execution_workflow,evals.workflow_step,evals.outbox_event,evals.budget_reservation TO evals_execution_admin;
GRANT SELECT,INSERT ON evals.provider_revision,evals.price_revision,evals.secret_version,evals.execution_event,evals.execution_cost_entry TO evals_execution_admin;
GRANT SELECT ON evals.execution_attempt,evals.execution_result TO evals_execution_admin;
GRANT USAGE ON SEQUENCE evals.execution_event_id_seq TO evals_execution_admin;
GRANT SELECT ON evals.artifact TO evals_execution_admin;
