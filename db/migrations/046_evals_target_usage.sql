-- Record customer-billed target calls before dispatch. Their external tariff is
-- unknown to Caudals, so this is an invocation/usage ledger, not a cash charge.
BEGIN;

CREATE TABLE evals.target_invocation_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  run_id uuid NOT NULL,
  target_revision_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','dispatched','recorded','unknown','released')),
  provenance text NOT NULL CHECK (provenance IN ('current','legacy_unmetered')),
  billing_scope text NOT NULL DEFAULT 'customer_external_unknown'
    CHECK (billing_scope='customer_external_unknown'),
  input_byte_bound integer NOT NULL CHECK (input_byte_bound>=0),
  output_token_bound integer NOT NULL CHECK (output_token_bound>=0),
  turn_bound integer NOT NULL CHECK (turn_bound>=0),
  tool_call_bound integer NOT NULL CHECK (tool_call_bound>=0),
  reported_input_tokens integer CHECK (reported_input_tokens>=0),
  reported_output_tokens integer CHECK (reported_output_tokens>=0),
  reported_cost_amount numeric(24,9) CHECK (reported_cost_amount>=0),
  reported_cost_currency text CHECK (reported_cost_currency ~ '^[A-Z]{3}$'),
  reported_cost_provenance text CHECK (reported_cost_provenance IN
    ('provider_reported','measured','estimated','customer_reported')),
  reason_code text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  finished_at timestamptz,
  UNIQUE (org_id,id),
  UNIQUE (org_id,attempt_id),
  FOREIGN KEY (org_id,attempt_id) REFERENCES evals.target_attempt(org_id,id),
  FOREIGN KEY (org_id,run_id) REFERENCES evals.run(org_id,id),
  FOREIGN KEY (org_id,target_revision_id) REFERENCES evals.target_revision(org_id,id),
  CHECK (provenance='legacy_unmetered' OR (input_byte_bound>0 AND output_token_bound>0 AND turn_bound>0)),
  CHECK ((reported_cost_amount IS NULL AND reported_cost_currency IS NULL AND reported_cost_provenance IS NULL)
    OR (reported_cost_amount IS NOT NULL AND reported_cost_currency IS NOT NULL AND reported_cost_provenance IS NOT NULL))
);
CREATE INDEX target_invocation_capacity ON evals.target_invocation_ledger
  (org_id,target_revision_id,state,claimed_at);
CREATE INDEX target_invocation_dispatch_window ON evals.target_invocation_ledger
  (org_id,target_revision_id,dispatched_at) WHERE dispatched_at IS NOT NULL;

ALTER TABLE evals.target_invocation_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.target_invocation_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.target_invocation_ledger
  USING (org_id=evals.org_id()) WITH CHECK (org_id=evals.org_id());
GRANT SELECT ON evals.target_invocation_ledger TO evals_runtime;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_worker') THEN
    GRANT SELECT,INSERT ON evals.target_invocation_ledger TO evals_worker;
    GRANT UPDATE (state,reported_input_tokens,reported_output_tokens,
      reported_cost_amount,reported_cost_currency,reported_cost_provenance,
      reason_code,dispatched_at,finished_at)
      ON evals.target_invocation_ledger TO evals_worker;
  END IF;
END $$;

-- Older attempts remain visible as explicitly unmetered history. Their
-- dispatched_at timestamp was written at claim time and is only approximate.
INSERT INTO evals.target_invocation_ledger
  (org_id,attempt_id,run_id,target_revision_id,state,provenance,
   input_byte_bound,output_token_bound,turn_bound,tool_call_bound,
   reason_code,claimed_at,dispatched_at,finished_at)
SELECT a.org_id,a.id,cu.run_id,a.target_revision_id,
  CASE a.status WHEN 'completed' THEN 'recorded' WHEN 'failed' THEN 'unknown'
    WHEN 'unknown' THEN 'unknown' WHEN 'canceled' THEN 'released'
    WHEN 'dispatching' THEN 'dispatched' ELSE 'reserved' END,
  'legacy_unmetered',0,0,0,0,'pre_ledger_backfill',a.created_at,
  CASE WHEN a.status IN ('claimed','canceled') THEN NULL ELSE a.dispatched_at END,
  a.finished_at
FROM evals.target_attempt a
JOIN evals.case_unit cu ON (cu.org_id,cu.id)=(a.org_id,a.case_unit_id);

ALTER TABLE evals.target_attempt ALTER COLUMN dispatched_at DROP NOT NULL;
ALTER TABLE evals.target_attempt ALTER COLUMN dispatched_at DROP DEFAULT;
UPDATE evals.target_attempt SET dispatched_at=NULL WHERE status='claimed';

CREATE FUNCTION evals.require_target_invocation_ledger()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
BEGIN
  IF NEW.status='dispatching' AND OLD.status IS DISTINCT FROM 'dispatching' THEN
    IF NOT EXISTS (
      SELECT 1 FROM evals.target_invocation_ledger l
      WHERE (l.org_id,l.attempt_id,l.target_revision_id)=(NEW.org_id,NEW.id,NEW.target_revision_id)
        AND l.state='dispatched' AND l.provenance='current'
    ) THEN
      RAISE EXCEPTION 'target dispatch requires current usage reservation' USING ERRCODE='23514';
    END IF;
    IF NEW.dispatched_at IS NULL THEN
      RAISE EXCEPTION 'target dispatch timestamp required' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER target_dispatch_ledger_guard
  BEFORE UPDATE OF status ON evals.target_attempt
  FOR EACH ROW EXECUTE FUNCTION evals.require_target_invocation_ledger();

CREATE FUNCTION evals.target_invocation_state_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
    (OLD.state='reserved' AND NEW.state IN ('dispatched','released')) OR
    (OLD.state='dispatched' AND NEW.state IN ('recorded','unknown')) OR
    (OLD.state='unknown' AND NEW.state='recorded')
  ) THEN
    RAISE EXCEPTION 'invalid target invocation state transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER target_invocation_state_guard
  BEFORE UPDATE ON evals.target_invocation_ledger
  FOR EACH ROW EXECUTE FUNCTION evals.target_invocation_state_guard();

COMMIT;
