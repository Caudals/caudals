BEGIN;

-- A scenario may make several requests under one target attempt. Each
-- outbound request has its own durable, tenant-scoped dispatch record.
CREATE TABLE evals.target_invocation_call (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  turn_ordinal integer NOT NULL CHECK (turn_ordinal BETWEEN 1 AND 1000),
  state text NOT NULL CHECK (state IN ('dispatched','recorded','unknown')),
  input_byte_bound integer NOT NULL CHECK (input_byte_bound>0),
  output_token_bound integer NOT NULL CHECK (output_token_bound>0),
  reported_input_tokens integer CHECK (reported_input_tokens>=0),
  reported_output_tokens integer CHECK (reported_output_tokens>=0),
  reported_cost_amount numeric(24,9) CHECK (reported_cost_amount>=0),
  reported_cost_currency text CHECK (reported_cost_currency ~ '^[A-Z]{3}$'),
  reported_cost_provenance text CHECK (reported_cost_provenance IN
    ('provider_reported','measured','estimated','customer_reported')),
  reason_code text,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(org_id,id),
  UNIQUE(org_id,attempt_id,turn_ordinal),
  FOREIGN KEY(org_id,attempt_id) REFERENCES evals.target_invocation_ledger(org_id,attempt_id),
  CHECK ((reported_cost_amount IS NULL AND reported_cost_currency IS NULL AND reported_cost_provenance IS NULL)
    OR (reported_cost_amount IS NOT NULL AND reported_cost_currency IS NOT NULL AND reported_cost_provenance IS NOT NULL))
);
CREATE INDEX target_invocation_call_window ON evals.target_invocation_call(org_id,dispatched_at);
ALTER TABLE evals.target_invocation_call ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.target_invocation_call FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.target_invocation_call
  USING (org_id=evals.org_id()) WITH CHECK (org_id=evals.org_id());
GRANT SELECT ON evals.target_invocation_call TO evals_runtime;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_worker') THEN
    GRANT SELECT,INSERT ON evals.target_invocation_call TO evals_worker;
    GRANT UPDATE(state,reported_input_tokens,reported_output_tokens,
      reported_cost_amount,reported_cost_currency,reported_cost_provenance,
      reason_code,finished_at) ON evals.target_invocation_call TO evals_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_browser') THEN
    GRANT SELECT,INSERT ON evals.target_invocation_call TO evals_browser;
    GRANT UPDATE(state,reported_input_tokens,reported_output_tokens,
      reported_cost_amount,reported_cost_currency,reported_cost_provenance,
      reason_code,finished_at) ON evals.target_invocation_call TO evals_browser;
  END IF;
END $$;

CREATE FUNCTION evals.target_invocation_call_state_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
BEGIN
  IF OLD.state<>'dispatched' THEN
    RAISE EXCEPTION 'target invocation call is immutable after settlement' USING ERRCODE='23514';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT
    (OLD.state='dispatched' AND NEW.state IN ('recorded','unknown')) THEN
    RAISE EXCEPTION 'invalid target invocation call state transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER target_invocation_call_state_guard
  BEFORE UPDATE ON evals.target_invocation_call
  FOR EACH ROW EXECUTE FUNCTION evals.target_invocation_call_state_guard();

CREATE FUNCTION evals.require_target_call_before_record()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
BEGIN
  IF NEW.state='recorded' AND OLD.state IS DISTINCT FROM 'recorded' AND
    (NOT EXISTS (SELECT 1 FROM evals.target_invocation_call c
      WHERE (c.org_id,c.attempt_id)=(NEW.org_id,NEW.attempt_id)) OR
     EXISTS (SELECT 1 FROM evals.target_invocation_call c
      WHERE (c.org_id,c.attempt_id)=(NEW.org_id,NEW.attempt_id)
        AND c.state='dispatched')) THEN
    RAISE EXCEPTION 'target call records required before recording attempt' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER target_call_record_guard
  BEFORE UPDATE OF state ON evals.target_invocation_ledger
  FOR EACH ROW EXECUTE FUNCTION evals.require_target_call_before_record();

COMMIT;
