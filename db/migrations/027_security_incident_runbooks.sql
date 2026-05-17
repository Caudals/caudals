-- Section 25 security-specific incident runbooks.

INSERT INTO runbook (key, title, owner_team, trigger_scenarios, checklist)
VALUES
  (
    'R-11',
    'Investigate a security incident',
    'security_on_call',
    ARRAY['security event', 'suspicious access', 'tenant data exposure', 'incident response'],
    '["Preserve logs, traces, delivery receipts, and audit rows before mitigation","Scope affected tenants, records, keys, integrations, and deliveries","Contain the active path and assign security plus operations owners","Engage external incident-response retainer when notification or forensic thresholds are met","Record buyer/supplier notification decisions and post-incident controls"]'::jsonb
  ),
  (
    'R-12',
    'Contain credential or signing-key compromise',
    'security_on_call',
    ARRAY['credential leak', 'signing key compromise', 'token abuse', 'secret rotation'],
    '["Disable or rotate the affected credential before reuse","Identify deliveries, integrations, webhooks, and operators that used the credential","Re-sign or re-issue affected artifacts when integrity evidence changed","Confirm Sentry, logs, and repository scans contain no secret value","Record rotation evidence and residual-risk acceptance"]'::jsonb
  ),
  (
    'R-13',
    'Handle subprocessor or infrastructure incident',
    'security_on_call',
    ARRAY['vendor incident', 'object store exposure', 'orchestrator incident', 'infrastructure breach'],
    '["Capture vendor notice, timestamps, and affected service boundaries","Map impacted Caudals datasets, buyers, suppliers, and processing activities","Pause risky delivery or processing jobs until containment is confirmed","Coordinate legal, DPA, and buyer security-review follow-up","Add compensating controls or exit-plan actions before closure"]'::jsonb
  )
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  owner_team = EXCLUDED.owner_team,
  trigger_scenarios = EXCLUDED.trigger_scenarios,
  checklist = EXCLUDED.checklist,
  state = 'active',
  updated_at = now();

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
    WHEN 'security_event' THEN 'R-11'
    ELSE 'R-08'
  END
$$;
