-- Persist Stripe webhook events to enforce idempotency and safe retries.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    stripe_event_id text NOT NULL UNIQUE,
    event_type text NOT NULL,
    processing_state text NOT NULL DEFAULT 'processing'
      CHECK (processing_state IN ('processing', 'processed', 'failed')),
    payload jsonb DEFAULT '{}'::jsonb,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    last_error text
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
    ON public.stripe_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_state
    ON public.stripe_webhook_events(processing_state);
