BEGIN;
DROP TRIGGER immutable_execution ON evals.provider_revision;
CREATE TRIGGER immutable_execution BEFORE UPDATE OR DELETE ON evals.provider_revision
  FOR EACH ROW EXECUTE FUNCTION evals.execution_immutable();
DROP FUNCTION evals.provider_revision_retire_only();
COMMIT;
