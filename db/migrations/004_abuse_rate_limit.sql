CREATE TABLE IF NOT EXISTS abuse_rate_limit (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abuse_rate_limit_reset_at
  ON abuse_rate_limit(reset_at);
