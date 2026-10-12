-- Public demo queue, report-by-email and fallback model (launch package L-03).
--
-- Queue: a run waits while queued_at is set and started_at is NULL. The web
-- process admits the oldest waiting run when a slot and model capacity are
-- free (FIFO by queued_at). A run that loses model capacity mid-way returns to
-- the queue with its original queued_at, so it keeps its place. Rows written
-- before this migration (queued_at NULL) count as started.
--
-- Report by email: the visitor's address is stored only as an AES-256-GCM
-- envelope (lib/evals/security/envelope.ts, purpose demo_notify) until the
-- report email is sent; then the envelope is deleted and notified_at is set.
--
-- Fallback model: demo.fallback_usage holds one row per UTC day. A call
-- reserves its worst-case cost in reserved_eur before it starts and settles
-- the actual cost into eur afterwards, all under DEMO_FALLBACK_DAILY_EUR, so
-- concurrent calls cannot exceed the cap. An interrupted call keeps its hold
-- (the cap errs on the side of spending less).
--
-- Forward repair: every object is additive. See the rollback for its guards.
BEGIN;

ALTER TABLE demo.run
  ADD COLUMN queued_at timestamptz,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN notify_email_ciphertext jsonb,
  ADD COLUMN notify_requested_at timestamptz,
  ADD COLUMN notified_at timestamptz,
  ADD COLUMN model_used text CHECK (model_used IS NULL OR length(model_used) <= 400),
  ADD COLUMN fallback_cost_eur numeric(12,6) NOT NULL DEFAULT 0 CHECK (fallback_cost_eur >= 0),
  ADD CONSTRAINT run_notify_consent CHECK (notify_email_ciphertext IS NULL OR notify_requested_at IS NOT NULL);

-- Runs from before the queue were started when they were created.
UPDATE demo.run SET queued_at = created_at, started_at = created_at WHERE queued_at IS NULL;

CREATE INDEX demo_run_queue ON demo.run (queued_at, id)
  WHERE started_at IS NULL AND phase NOT IN ('done','failed');
CREATE INDEX demo_run_notify ON demo.run (finished_at)
  WHERE notify_email_ciphertext IS NOT NULL;

CREATE TABLE demo.fallback_usage (
  day date PRIMARY KEY,
  -- Settled spend on the fallback model, in euros.
  eur numeric(12,6) NOT NULL DEFAULT 0 CHECK (eur >= 0),
  -- Worst-case holds of calls in flight (or interrupted before settling).
  reserved_eur numeric(12,6) NOT NULL DEFAULT 0 CHECK (reserved_eur >= 0),
  calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON demo.fallback_usage FROM PUBLIC;
-- A spend record: the web process reserves and settles, and never deletes.
GRANT SELECT, INSERT, UPDATE ON demo.fallback_usage TO evals_runtime;

-- Server-side demo lifecycle events. The runtime may append analytics but
-- receives no permission to read visitors' history or change past events.
GRANT INSERT ON public.product_analytics_event TO evals_runtime;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evals_browser') THEN
    -- The browser worker serves admitted runs only and releases a run that
    -- went back to the queue.
    GRANT SELECT (queued_at, started_at) ON demo.run TO evals_browser;
  END IF;
END $$;

COMMIT;
