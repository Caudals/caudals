CREATE TABLE IF NOT EXISTS waitlist_signup (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'wl')),
  full_name text,
  email citext NOT NULL UNIQUE,
  company text,
  use_case text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','qualified','converted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_signup_email
  ON waitlist_signup(email);

CREATE INDEX IF NOT EXISTS idx_waitlist_signup_status
  ON waitlist_signup(status);

DROP TRIGGER IF EXISTS waitlist_signup_touch_updated_at ON waitlist_signup;
CREATE TRIGGER waitlist_signup_touch_updated_at
BEFORE UPDATE ON waitlist_signup
FOR EACH ROW
EXECUTE FUNCTION app_private.touch_updated_at();
