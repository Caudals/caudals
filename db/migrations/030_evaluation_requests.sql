-- Evaluation requests from the public /contact form.
--
-- The sales pipeline stays on buyer_opportunity; this table holds what the
-- requester told us about the AI system to evaluate. Values mirror
-- lib/validators/evaluation-request.ts. Apply before deploying the intake
-- code that writes it; one transaction keeps table and backfill together.

BEGIN;

CREATE TABLE IF NOT EXISTS evaluation_request (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'er')),
  org_id text NOT NULL REFERENCES organization(id),
  buyer_opportunity_id text REFERENCES buyer_opportunity(id),
  contact_id text REFERENCES contact(id),
  organization_name text NOT NULL,
  organization_website text,
  company_size text CHECK (company_size IN ('1-49','50-199','200-500','501+')),
  system_type text NOT NULL CHECK (system_type IN (
    'customer-assistant','voice-agent','internal-assistant',
    'document-pipeline','product-feature','other'
  )),
  system_stage text CHECK (system_stage IN ('live','pilot','planned')),
  sector text NOT NULL CHECK (sector IN (
    'insurance','industrial','banking','energy','telecom',
    'healthcare','legal','travel','retail','other'
  )),
  owner_role text NOT NULL CHECK (owner_role IN (
    'customer-service','digital','after-sales','quality-operations',
    'it-data','management','integrator','other'
  )),
  system_answers text NOT NULL,
  system_url text,
  requested_offer text CHECK (requested_offer IN (
    'reality-check','pilot-evaluation','monthly-subscription','not-sure'
  )),
  notes text,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'new' CHECK (state IN (
    'new','qualified','reality_check','readout','converted','closed'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS evaluation_request_org_state_idx
  ON evaluation_request (org_id, state, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS evaluation_request_opportunity_idx
  ON evaluation_request (buyer_opportunity_id)
  WHERE buyer_opportunity_id IS NOT NULL;

DROP TRIGGER IF EXISTS evaluation_request_touch_updated_at ON evaluation_request;
CREATE TRIGGER evaluation_request_touch_updated_at
  BEFORE UPDATE ON evaluation_request
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE evaluation_request ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evaluation_request_operator_scope ON evaluation_request;
CREATE POLICY evaluation_request_operator_scope
  ON evaluation_request
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());

-- Requests submitted between the 2026-09-11 repositioning and this migration
-- exist only as an opportunity plus the structured copy on its audit
-- transition. Copy each one across once; the request id reuses the
-- opportunity's ULID body, so re-running the migration inserts nothing.
INSERT INTO evaluation_request (
  id, org_id, buyer_opportunity_id, contact_id, organization_name,
  organization_website, company_size, system_type, system_stage, sector,
  owner_role, system_answers, system_url, requested_offer, notes, source,
  state, created_at, updated_at
)
SELECT
  'er_' || substr(bo.id, 4),
  bo.org_id,
  bo.id,
  bo.contact_id,
  COALESCE(substring(bo.title FROM '^Evaluation request from (.*)$'), bo.title),
  request ->> 'organization_website',
  CASE WHEN request ->> 'company_size' IN ('1-49','50-199','200-500','501+')
    THEN request ->> 'company_size' END,
  CASE WHEN request ->> 'system_type' IN (
      'customer-assistant','voice-agent','internal-assistant',
      'document-pipeline','product-feature'
    ) THEN request ->> 'system_type' ELSE 'other' END,
  CASE WHEN request ->> 'system_stage' IN ('live','pilot','planned')
    THEN request ->> 'system_stage' END,
  CASE WHEN request ->> 'sector' IN (
      'insurance','industrial','banking','energy','telecom',
      'healthcare','legal','travel','retail'
    ) THEN request ->> 'sector' ELSE 'other' END,
  CASE WHEN request ->> 'owner_role' IN (
      'customer-service','digital','after-sales','quality-operations',
      'it-data','management','integrator'
    ) THEN request ->> 'owner_role' ELSE 'other' END,
  COALESCE(substring(bo.use_case FROM '^What it answers: (.*?)\nSystem: '), bo.use_case),
  request ->> 'system_url',
  CASE WHEN request ->> 'requested_offer' IN (
      'reality-check','pilot-evaluation','monthly-subscription'
    ) THEN request ->> 'requested_offer' END,
  substring(bo.use_case FROM '\nNotes: (.*)$'),
  jsonb_strip_nulls(jsonb_build_object(
    'channel', 'public_contact',
    'referer', request ->> 'referer',
    'submitted_at', request ->> 'submitted_at',
    'backfilled_from_audit_event', ae.id
  )),
  'new',
  ae.created_at,
  now()
FROM audit_event ae
JOIN buyer_opportunity bo ON bo.id = ae.target_id
CROSS JOIN LATERAL (SELECT ae.metadata -> 'evaluation_request' AS request) AS extracted
WHERE ae.target_type = 'buyer_opportunity'
  AND ae.action = 'state_transition'
  AND ae.metadata ->> 'request_type' = 'evaluation_request'
  AND jsonb_typeof(ae.metadata -> 'evaluation_request') = 'object'
  AND NOT EXISTS (
    SELECT 1 FROM evaluation_request er WHERE er.buyer_opportunity_id = bo.id
  );

COMMIT;
