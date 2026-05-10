CREATE TABLE IF NOT EXISTS stripe_webhook_event (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processing_state text NOT NULL DEFAULT 'processing'
    CHECK (processing_state IN ('processing','processed','failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_event_received_at
  ON stripe_webhook_event(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_event_state
  ON stripe_webhook_event(processing_state);
