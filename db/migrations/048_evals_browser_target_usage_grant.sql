-- The isolated browser worker reserves target usage before dispatch, just as
-- the general worker does. Grant only the ledger fields it reads and writes.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_browser') THEN
    GRANT SELECT,INSERT ON evals.target_invocation_ledger TO evals_browser;
    GRANT UPDATE (state,reported_input_tokens,reported_output_tokens,
      reported_cost_amount,reported_cost_currency,reported_cost_provenance,
      reason_code,dispatched_at,finished_at)
      ON evals.target_invocation_ledger TO evals_browser;
  END IF;
END $$;
