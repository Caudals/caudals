-- Run as migration owner AFTER provisioning a LOGIN evals_worker role with
-- NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; never grant it to evals_runtime.
-- Credentials are provisioned outside source control. Domain role owns no schema.
GRANT USAGE ON SCHEMA evals TO evals_worker;
GRANT SELECT ON evals.provider_revision,evals.price_revision,evals.provider_account,evals.provider_health,evals.secret_record,evals.secret_version TO evals_worker;
GRANT UPDATE(settled,reserved) ON evals.provider_account TO evals_worker;
GRANT INSERT,UPDATE ON evals.provider_health TO evals_worker;
GRANT SELECT,INSERT,UPDATE ON evals.provider_slot TO evals_worker;
GRANT SELECT,INSERT,UPDATE ON evals.execution_workflow,evals.workflow_step,evals.execution_attempt,evals.execution_budget,evals.budget_reservation,evals.outbox_event TO evals_worker;
GRANT SELECT,INSERT ON evals.execution_result,evals.execution_event,evals.execution_cost_entry TO evals_worker;
GRANT USAGE ON SEQUENCE evals.execution_event_id_seq TO evals_worker;
-- Web receives execution intent/status only, no provider endpoints/envelopes/cap mutation.
GRANT SELECT,INSERT,UPDATE ON evals.execution_workflow,evals.workflow_step,evals.outbox_event TO evals_runtime;
GRANT SELECT,INSERT ON evals.execution_event TO evals_runtime;
GRANT SELECT ON evals.execution_attempt,evals.execution_result,evals.execution_budget,evals.budget_reservation,evals.execution_cost_entry TO evals_runtime;
GRANT USAGE ON SEQUENCE evals.execution_event_id_seq TO evals_runtime;
-- Apply after Stage B migrations when these relations exist.
DO $$ BEGIN
 IF to_regclass('evals.case_unit') IS NOT NULL THEN
  GRANT SELECT ON evals.target,evals.target_revision,evals.run TO evals_worker;
  GRANT UPDATE(status,phase,updated_at) ON evals.run TO evals_worker;
  GRANT SELECT,UPDATE ON evals.case_unit TO evals_worker;
  GRANT SELECT,INSERT ON evals.observation TO evals_worker;
  GRANT SELECT,INSERT,UPDATE ON evals.target_attempt TO evals_worker;
 END IF;
END $$;
-- Queue login is a DIFFERENT non-superuser role owning only its dedicated queue
-- schema/database. Do not grant that identity any evals-domain table access.
GRANT EXECUTE ON FUNCTION evals.org_id(),evals.actor_id() TO evals_worker;
