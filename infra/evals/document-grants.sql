-- Provision evals_document as LOGIN NOSUPERUSER NOBYPASSRLS with no inherited
-- runtime/worker/admin role. Apply after migrations 031-038.
GRANT USAGE ON SCHEMA evals TO evals_document;
GRANT EXECUTE ON FUNCTION evals.org_id(),evals.actor_id() TO evals_document;
GRANT SELECT ON evals.export_job,evals.report_revision,evals.report TO evals_document;
GRANT UPDATE(status,artifact_id,reason_code,updated_at) ON evals.export_job TO evals_document;
GRANT SELECT,INSERT ON evals.artifact,evals.report_artifact,evals.notification TO evals_document;
