-- Section 24 escalation runbooks and operator escalation cases.

CREATE TABLE IF NOT EXISTS runbook (
  key text PRIMARY KEY CHECK (key ~ '^R-[0-9]{2}$'),
  title text NOT NULL,
  owner_team text NOT NULL,
  trigger_scenarios text[] NOT NULL DEFAULT ARRAY[]::text[],
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO runbook (key, title, owner_team, trigger_scenarios, checklist)
VALUES
  (
    'R-01',
    'Onboard a new supplier asset',
    'supplier_operations',
    ARRAY['new supplier asset', 'provenance dispute', 'rights intake'],
    '["Confirm authority to license the asset","Collect sample and provenance evidence","Review sensitivity and rights boundaries","Create supplier_asset and linked license work items"]'::jsonb
  ),
  (
    'R-02',
    'Qualify a buyer demand signal',
    'commercials_on_call',
    ARRAY['new buyer brief', 'qualification request', 'market demand signal'],
    '["Capture buyer use case and modality","Confirm budget and timeline","Create opportunity and dataset brief","Route feasibility blockers to operations"]'::jsonb
  ),
  (
    'R-03',
    'Resolve a buyer delivery dispute',
    'commercials_on_call',
    ARRAY['buyer dispute', 'delivery rejected', 'quality disagreement'],
    '["Acknowledge dispute and freeze risky follow-ups","Review delivery receipt, QA report, and contract terms","Assign commercial and operations owners","Record resolution summary before closure"]'::jsonb
  ),
  (
    'R-04',
    'Handle a privacy or rights gate failure',
    'privacy_on_call',
    ARRAY['privacy gate failure', 'rights gate failure', 'PII finding'],
    '["Pause release path","Review PII map, consent, and license clauses","Document mitigation or suppression decision","Re-run the blocked gate before release"]'::jsonb
  ),
  (
    'R-05',
    'Recover a supplier delivery failure',
    'supplier_operations',
    ARRAY['supplier delivery failure', 'late sample', 'broken data delivery'],
    '["Contact supplier owner","Confirm latest available source package","Replan affected build or delivery dates","Escalate contract remedy if SLA remains at risk"]'::jsonb
  ),
  (
    'R-06',
    'Process a privacy rights request',
    'privacy_on_call',
    ARRAY['DSAR', 'privacy incident', 'subject rights request'],
    '["Verify requester identity","Locate affected datasets and deliveries","Propagate suppression or export actions","Record completion evidence and audit trail"]'::jsonb
  ),
  (
    'R-07',
    'Triage an operator data-quality exception',
    'quality_operations',
    ARRAY['QA failure', 'Cleanlab requeue', 'labeling drift'],
    '["Inspect QA and labeling evidence","Assign remediation owner","Re-run impacted validation pass","Document exception disposition"]'::jsonb
  ),
  (
    'R-08',
    'Respond to a platform or security incident',
    'security_on_call',
    ARRAY['security event', 'platform incident', 'service outage'],
    '["Assess blast radius and affected tenants","Stabilize service and preserve logs","Notify security and operations owners","Open follow-up controls before closure"]'::jsonb
  ),
  (
    'R-09',
    'Rotate a delivery signing key',
    'security_on_call',
    ARRAY['signing key rotation', 'key compromise', 'delivery integrity'],
    '["Create replacement key through Settings","Move affected deliveries to the new key","Retire or revoke the old key","Record audit evidence for the rotation"]'::jsonb
  ),
  (
    'R-10',
    'Publish a governed dataset release',
    'dataset_operations',
    ARRAY['release readiness', 'catalogue publication', 'documentation bundle'],
    '["Confirm all G-1 through G-7 gates","Review release documentation bundle","Confirm catalogue listing and preview policy","Publish only after final operator approval"]'::jsonb
  )
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  owner_team = EXCLUDED.owner_team,
  trigger_scenarios = EXCLUDED.trigger_scenarios,
  checklist = EXCLUDED.checklist,
  state = 'active',
  updated_at = now();

DROP TRIGGER IF EXISTS runbook_touch_updated_at ON runbook;
CREATE TRIGGER runbook_touch_updated_at
  BEFORE UPDATE ON runbook
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE runbook ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS runbook_operator_read ON runbook;
CREATE POLICY runbook_operator_read
  ON runbook
  FOR SELECT
  USING (app_private.is_service_role() OR app_private.current_org_id() IS NOT NULL);

CREATE TABLE IF NOT EXISTS escalation_case (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'ec')),
  org_id text NOT NULL REFERENCES organization(id),
  title text NOT NULL,
  escalation_kind text NOT NULL DEFAULT 'platform_incident' CHECK (
    escalation_kind IN (
      'privacy_incident',
      'provenance_dispute',
      'supplier_delivery_failure',
      'buyer_dispute',
      'security_event',
      'platform_incident'
    )
  ),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  source_record_type text,
  source_record_id text,
  detail text NOT NULL DEFAULT '',
  runbook_key text REFERENCES runbook(key),
  routed_to text NOT NULL DEFAULT 'operations_on_call',
  sla_due_at timestamptz,
  state text NOT NULL DEFAULT 'open' CHECK (
    state IN ('open','triaged','mitigating','monitoring','resolved','cancelled')
  ),
  resolved_at timestamptz,
  resolution_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CONSTRAINT escalation_case_detail_check CHECK (
    deleted_at IS NOT NULL OR char_length(detail) >= 6
  ),
  CONSTRAINT escalation_case_resolution_check CHECK (
    state <> 'resolved'
    OR (
      resolved_at IS NOT NULL
      AND char_length(COALESCE(resolution_summary, '')) >= 6
    )
  )
);

CREATE INDEX IF NOT EXISTS escalation_case_org_state_idx
  ON escalation_case (org_id, state, sla_due_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS escalation_case_runbook_idx
  ON escalation_case (runbook_key, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS alert_open_escalation_case_idx
  ON alert (org_id, target_type, target_id)
  WHERE target_type = 'escalation_case'
    AND state <> 'resolved'
    AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app_private.escalation_runbook_for_kind(kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE kind
    WHEN 'privacy_incident' THEN 'R-06'
    WHEN 'provenance_dispute' THEN 'R-01'
    WHEN 'supplier_delivery_failure' THEN 'R-05'
    WHEN 'buyer_dispute' THEN 'R-03'
    WHEN 'security_event' THEN 'R-08'
    ELSE 'R-08'
  END
$$;

CREATE OR REPLACE FUNCTION app_private.escalation_team_for_kind(kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE kind
    WHEN 'privacy_incident' THEN 'privacy_on_call'
    WHEN 'provenance_dispute' THEN 'trust_and_safety'
    WHEN 'supplier_delivery_failure' THEN 'supplier_operations'
    WHEN 'buyer_dispute' THEN 'commercials_on_call'
    WHEN 'security_event' THEN 'security_on_call'
    ELSE 'operations_on_call'
  END
$$;

CREATE OR REPLACE FUNCTION app_private.escalation_sla_interval(kind text, severity text)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN severity = 'critical' THEN interval '4 hours'
    WHEN kind IN ('privacy_incident', 'security_event') THEN interval '8 hours'
    WHEN severity = 'warning' THEN interval '1 day'
    ELSE interval '3 days'
  END
$$;

CREATE OR REPLACE FUNCTION app_private.prepare_escalation_case()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.runbook_key IS NULL OR NEW.runbook_key = '' THEN
    NEW.runbook_key := app_private.escalation_runbook_for_kind(NEW.escalation_kind);
  END IF;

  IF NEW.routed_to IS NULL
    OR NEW.routed_to = ''
    OR (
      TG_OP = 'INSERT'
      AND NEW.routed_to = 'operations_on_call'
      AND NEW.escalation_kind <> 'platform_incident'
    )
  THEN
    NEW.routed_to := app_private.escalation_team_for_kind(NEW.escalation_kind);
  END IF;

  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := now() + app_private.escalation_sla_interval(
      NEW.escalation_kind,
      NEW.severity
    );
  END IF;

  IF NEW.state = 'resolved' AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.open_escalation_case_alert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_alert_id text;
  new_audit_id text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM alert
    WHERE org_id = NEW.org_id
      AND target_type = 'escalation_case'
      AND target_id = NEW.id
      AND state <> 'resolved'
      AND deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  new_alert_id := 'al_' || upper(replace(gen_random_uuid()::text, '-', ''));
  new_audit_id := 'ae_' || upper(replace(gen_random_uuid()::text, '-', ''));

  INSERT INTO alert (
    id, org_id, severity, title, target_type, target_id, state, created_by
  )
  VALUES (
    new_alert_id,
    NEW.org_id,
    NEW.severity,
    'Escalation: ' || NEW.title,
    'escalation_case',
    NEW.id,
    'open',
    NEW.created_by
  );

  INSERT INTO audit_event (
    id, org_id, actor_id, action, target_type, target_id, metadata
  )
  VALUES (
    new_audit_id,
    NEW.org_id,
    NEW.created_by,
    'escalation_case.routed',
    'escalation_case',
    NEW.id,
    jsonb_strip_nulls(jsonb_build_object(
      'escalation_kind', NEW.escalation_kind,
      'severity', NEW.severity,
      'runbook_key', NEW.runbook_key,
      'routed_to', NEW.routed_to,
      'sla_due_at', NEW.sla_due_at,
      'source_record_type', NEW.source_record_type,
      'source_record_id', NEW.source_record_id
    ))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escalation_case_prepare ON escalation_case;
CREATE TRIGGER escalation_case_prepare
  BEFORE INSERT OR UPDATE ON escalation_case
  FOR EACH ROW EXECUTE FUNCTION app_private.prepare_escalation_case();

DROP TRIGGER IF EXISTS escalation_case_open_alert ON escalation_case;
CREATE TRIGGER escalation_case_open_alert
  AFTER INSERT ON escalation_case
  FOR EACH ROW EXECUTE FUNCTION app_private.open_escalation_case_alert();

DROP TRIGGER IF EXISTS escalation_case_touch_updated_at ON escalation_case;
CREATE TRIGGER escalation_case_touch_updated_at
  BEFORE UPDATE ON escalation_case
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE escalation_case ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS escalation_case_operator_scope ON escalation_case;
CREATE POLICY escalation_case_operator_scope
  ON escalation_case
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
