-- Cross-module operator notes for audited CRUD on any console record.

CREATE TABLE IF NOT EXISTS operator_record_note (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'on')),
  org_id text NOT NULL REFERENCES organization(id),
  module_key text NOT NULL CHECK (module_key IN (
    'pipeline','leads','suppliers','buyers','builds','datasets','quality',
    'privacy','catalogue','commercials','operations','audit','settings'
  )),
  target_type text NOT NULL,
  target_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  updated_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  deleted_by text REFERENCES "operator"(id)
);

CREATE INDEX IF NOT EXISTS operator_record_note_target_idx
  ON operator_record_note (org_id, module_key, target_type, target_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS operator_record_note_touch_updated_at ON operator_record_note;
CREATE TRIGGER operator_record_note_touch_updated_at
  BEFORE UPDATE ON operator_record_note
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE operator_record_note ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_record_note_operator_scope ON operator_record_note;
CREATE POLICY operator_record_note_operator_scope ON operator_record_note
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
