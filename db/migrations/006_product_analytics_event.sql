CREATE TABLE IF NOT EXISTS product_analytics_event (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'pa')),
  event_name text NOT NULL,
  event_category text NOT NULL CHECK (event_category IN ('funnel','dashboard','product')),
  user_id text,
  user_role text,
  session_id text,
  path text,
  source text NOT NULL CHECK (source IN ('client','server')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_analytics_event_name
  ON product_analytics_event(event_name);

CREATE INDEX IF NOT EXISTS idx_product_analytics_event_occurred_at
  ON product_analytics_event(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_analytics_event_user_id
  ON product_analytics_event(user_id);
