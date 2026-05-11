-- Time-bounded operator elevation grants for audited production DB access.

CREATE TABLE IF NOT EXISTS operator_elevation (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'oe')),
  org_id text NOT NULL REFERENCES organization(id),
  operator_id text NOT NULL REFERENCES "operator"(id),
  scope text NOT NULL CHECK (scope IN ('production_db')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','revoked')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by text REFERENCES "operator"(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (
    (state = 'active' AND revoked_at IS NULL)
    OR (state = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS operator_elevation_active_idx
  ON operator_elevation (org_id, operator_id, scope, expires_at DESC)
  WHERE state = 'active' AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS operator_elevation_touch_updated_at ON operator_elevation;
CREATE TRIGGER operator_elevation_touch_updated_at
  BEFORE UPDATE ON operator_elevation
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE operator_elevation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_elevation_operator_scope ON operator_elevation;
CREATE POLICY operator_elevation_operator_scope ON operator_elevation
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
