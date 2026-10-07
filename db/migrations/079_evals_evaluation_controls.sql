-- Operator intent stays separate from late model completions.
BEGIN;
ALTER TABLE evals.generation_job ADD COLUMN control_state text NOT NULL DEFAULT 'active'
  CHECK (control_state IN ('active','paused','stopped'));
ALTER TABLE evals.generation_job ADD COLUMN start_input jsonb;

-- Restart survives page closure and is created only after the old claims drain.
CREATE TABLE evals.evaluation_restart (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  evaluation_id uuid NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('generation','run')),
  subject_id uuid NOT NULL,
  input jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','canceled')),
  new_subject_id uuid,
  reason_code text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id)
);
CREATE UNIQUE INDEX evaluation_restart_pending ON evals.evaluation_restart(org_id,evaluation_id) WHERE status='pending';
ALTER TABLE evals.evaluation_restart ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.evaluation_restart FORCE ROW LEVEL SECURITY;
CREATE POLICY evaluation_restart_tenant ON evals.evaluation_restart
  USING (org_id=nullif(current_setting('evals.org_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
REVOKE ALL ON evals.evaluation_restart FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON evals.evaluation_restart TO evals_runtime;
-- A late completion of a manually controlled job must not ask for input.
DROP TRIGGER generation_job_notice ON evals.generation_job;
CREATE TRIGGER generation_job_notice AFTER INSERT OR UPDATE OF status ON evals.generation_job
  FOR EACH ROW WHEN (NEW.control_state='active') EXECUTE FUNCTION evals.notify_job_transition();
COMMIT;
