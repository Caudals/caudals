-- M3 SOC 2 Type I / ISO 27001 scoping register.
-- Stores scoped controls, framework mappings, and evidence links for operator review.

CREATE TABLE IF NOT EXISTS compliance_control_scope (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'cc')),
  org_id text NOT NULL REFERENCES organization(id),
  control_key text NOT NULL,
  title text NOT NULL,
  control_family text NOT NULL CHECK (
    control_family IN (
      'identity_access',
      'data_protection',
      'network_infrastructure',
      'governance',
      'observability',
      'incident_response',
      'vendor_risk'
    )
  ),
  framework_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope_boundary text NOT NULL DEFAULT '',
  owner_operator_id text REFERENCES "operator"(id),
  evidence_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  implementation_status text NOT NULL DEFAULT 'planned' CHECK (
    implementation_status IN ('planned','implemented','partial','exception','deferred')
  ),
  risk_notes text,
  review_cadence text NOT NULL DEFAULT 'quarterly',
  next_review_at timestamptz,
  scoped_at timestamptz,
  approved_at timestamptz,
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','scoped','evidence_review','ready','exception','deferred','retired')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  UNIQUE (org_id, control_key),
  CONSTRAINT compliance_control_scope_evidence_check CHECK (
    state NOT IN ('scoped','evidence_review','ready','exception')
    OR (
      char_length(scope_boundary) >= 6
      AND owner_operator_id IS NOT NULL
      AND framework_mappings ?& ARRAY['soc2','iso27001']
      AND jsonb_typeof(evidence_sources) = 'array'
      AND jsonb_array_length(evidence_sources) > 0
      AND jsonb_typeof(linked_records) = 'array'
      AND jsonb_array_length(linked_records) > 0
    )
  ),
  CONSTRAINT compliance_control_scope_ready_check CHECK (
    state <> 'ready'
    OR (
      implementation_status = 'implemented'
      AND next_review_at IS NOT NULL
      AND approved_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS compliance_control_scope_org_state_idx
  ON compliance_control_scope (org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS compliance_control_scope_family_idx
  ON compliance_control_scope (org_id, control_family)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS compliance_control_scope_touch_updated_at
  ON compliance_control_scope;
CREATE TRIGGER compliance_control_scope_touch_updated_at
  BEFORE UPDATE ON compliance_control_scope
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE compliance_control_scope ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compliance_control_scope_operator_scope
  ON compliance_control_scope;
CREATE POLICY compliance_control_scope_operator_scope
  ON compliance_control_scope
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
