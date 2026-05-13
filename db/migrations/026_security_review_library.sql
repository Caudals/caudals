-- M3 buyer security review library.
-- Stores approved public questionnaire answers and review-packet items.

CREATE TABLE IF NOT EXISTS security_review_artifact (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'sr')),
  org_id text NOT NULL REFERENCES organization(id),
  artifact_key text NOT NULL,
  artifact_type text NOT NULL CHECK (
    artifact_type IN (
      'questionnaire_answer',
      'dpa_review_path',
      'evidence_packet_item',
      'readiness_caveat'
    )
  ),
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public','nda','internal')),
  title text NOT NULL,
  question text,
  answer text NOT NULL,
  summary text NOT NULL DEFAULT '',
  control_family text NOT NULL DEFAULT 'governance' CHECK (
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
  control_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_team text NOT NULL DEFAULT 'security',
  display_order integer NOT NULL DEFAULT 100,
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','published','needs_review','retired')
  ),
  published_at timestamptz,
  review_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  UNIQUE (org_id, artifact_key),
  CONSTRAINT security_review_artifact_public_check CHECK (
    state <> 'published'
    OR (
      audience IS NOT NULL
      AND char_length(title) >= 3
      AND char_length(answer) >= 20
      AND jsonb_typeof(evidence_refs) = 'array'
      AND review_due_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS security_review_artifact_public_idx
  ON security_review_artifact (audience, state, display_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS security_review_artifact_org_type_idx
  ON security_review_artifact (org_id, artifact_type, state, updated_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS security_review_artifact_touch_updated_at
  ON security_review_artifact;
CREATE TRIGGER security_review_artifact_touch_updated_at
  BEFORE UPDATE ON security_review_artifact
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE security_review_artifact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_review_artifact_public_read
  ON security_review_artifact;
CREATE POLICY security_review_artifact_public_read
  ON security_review_artifact
  FOR SELECT
  USING (
    app_private.is_service_role()
    OR org_id = app_private.current_org_id()
    OR (
      audience = 'public'
      AND state = 'published'
      AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS security_review_artifact_operator_write
  ON security_review_artifact;
CREATE POLICY security_review_artifact_operator_write
  ON security_review_artifact
  FOR ALL
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());

WITH tenant AS (
  SELECT id AS org_id
  FROM organization
  WHERE id = 'or_01J20000000000000000000001'
     OR kind = 'internal'
  ORDER BY CASE WHEN id = 'or_01J20000000000000000000001' THEN 0 ELSE 1 END,
           created_at NULLS LAST,
           id
  LIMIT 1
), seed_rows AS (
  SELECT * FROM (
    VALUES
      (
        'sr_01J30000000000000000000001',
        'buyer_supplier_data_isolation',
        'questionnaire_answer',
        'Identity and tenant isolation',
        'How is buyer and supplier data isolated?',
        'Production data access is scoped through Postgres RLS and server-side session context. Public routes never expose operator-only tables.',
        'Buyer and supplier data is isolated through server-side session context and RLS.',
        'identity_access',
        ARRAY['app.current_org_id','Postgres RLS','Better Auth session'],
        '[{"type":"control","label":"Postgres RLS tenancy"},{"type":"runtime","label":"Server-side session context"}]'::jsonb,
        'security',
        10
      ),
      (
        'sr_01J30000000000000000000002',
        'dataset_release_evidence',
        'questionnaire_answer',
        'Dataset release evidence',
        'What evidence is attached to a dataset release?',
        'Release bundles include package manifests, Croissant JSON-LD, Article 10 notes, validation status, QA evidence, and mirror metadata when public distribution is approved.',
        'Dataset releases carry machine-readable and operator-reviewed evidence.',
        'data_protection',
        ARRAY['release_documentation_bundle','Croissant','EU AI Act Article 10'],
        '[{"type":"record","label":"release_documentation_bundle"},{"type":"standard","label":"MLCommons Croissant"}]'::jsonb,
        'data_operations',
        20
      ),
      (
        'sr_01J30000000000000000000003',
        'incident_routing',
        'questionnaire_answer',
        'Incident and escalation routing',
        'How are incidents routed?',
        'Operators can open escalation cases for privacy, provenance, supplier, buyer, security, or platform events. Cases route to the mapped runbook and create alert plus audit evidence.',
        'Escalation cases map incidents to runbooks, alerts, and audit evidence.',
        'incident_response',
        ARRAY['escalation_case','runbook','audit_event'],
        '[{"type":"record","label":"escalation_case"},{"type":"record","label":"runbook"},{"type":"record","label":"audit_event"}]'::jsonb,
        'security',
        30
      ),
      (
        'sr_01J30000000000000000000004',
        'formal_review_gates',
        'readiness_caveat',
        'Formal review readiness gates',
        'What is still gated before formal security review?',
        'Sentry error delivery and external PagerDuty routing are code-ready but require production DSN and contact-point credentials before they can be marked live.',
        'Credential-gated observability and on-call routing are tracked separately from implemented controls.',
        'observability',
        ARRAY['SENTRY_DSN','Alertmanager','PagerDuty'],
        '[{"type":"credential","label":"SENTRY_DSN"},{"type":"credential","label":"PagerDuty contact point"}]'::jsonb,
        'security',
        40
      ),
      (
        'sr_01J30000000000000000000005',
        'security_posture_summary',
        'evidence_packet_item',
        'Security posture summary',
        NULL,
        'Public summary of implemented controls, open readiness caveats, and security-review routing.',
        'Included in the buyer security review packet.',
        'governance',
        ARRAY['security_review_artifact'],
        '[{"type":"page","label":"/security"}]'::jsonb,
        'security',
        110
      ),
      (
        'sr_01J30000000000000000000006',
        'standard_dpa_review_path',
        'dpa_review_path',
        'Standard DPA review path',
        NULL,
        'DPA requests are routed through contact intake for operator review before any buyer-specific legal terms are shared.',
        'Legal follow-up is routed rather than published as unsigned terms.',
        'governance',
        ARRAY['contact','buyer_opportunity'],
        '[{"type":"route","label":"/contact"},{"type":"record","label":"buyer_opportunity"}]'::jsonb,
        'operations',
        120
      ),
      (
        'sr_01J30000000000000000000007',
        'soc2_iso_scope',
        'evidence_packet_item',
        'SOC 2 and ISO 27001 control scope',
        NULL,
        'Control scope, framework mappings, owner, evidence links, and review cadence are tracked in compliance control records.',
        'Control scope is available for qualified security reviews.',
        'governance',
        ARRAY['compliance_control_scope','SOC 2','ISO 27001'],
        '[{"type":"record","label":"compliance_control_scope"}]'::jsonb,
        'security',
        130
      ),
      (
        'sr_01J30000000000000000000008',
        'dataset_provenance_pii_notes',
        'evidence_packet_item',
        'Dataset provenance and PII handling notes',
        NULL,
        'Dataset review packets include provenance, consent, PII handling, license, QA, and release documentation evidence.',
        'Dataset-specific evidence is shared under the right commercial or NDA path.',
        'data_protection',
        ARRAY['license_clause','consent_record','pii_map','qa_report'],
        '[{"type":"record","label":"license_clause"},{"type":"record","label":"pii_map"},{"type":"record","label":"qa_report"}]'::jsonb,
        'privacy',
        140
      ),
      (
        'sr_01J30000000000000000000009',
        'incident_response_runbooks',
        'evidence_packet_item',
        'Incident response and escalation runbooks',
        NULL,
        'Canonical R-01 through R-10 runbooks cover supplier, buyer, privacy, rights, platform, and security escalation paths.',
        'Runbook coverage is available for qualified security reviews.',
        'incident_response',
        ARRAY['R-01','R-08','escalation_case'],
        '[{"type":"record","label":"runbook"},{"type":"record","label":"escalation_case"}]'::jsonb,
        'security',
        150
      ),
      (
        'sr_01J30000000000000000000010',
        'security_questionnaire_answers',
        'evidence_packet_item',
        'Security questionnaire answers',
        NULL,
        'Approved public answers are maintained as versioned review artifacts and can be expanded for buyer-specific questionnaires.',
        'Questionnaire answers are backed by the security review library.',
        'governance',
        ARRAY['security_review_artifact'],
        '[{"type":"record","label":"security_review_artifact"}]'::jsonb,
        'security',
        160
      )
  ) AS values (
    id,
    artifact_key,
    artifact_type,
    title,
    question,
    answer,
    summary,
    control_family,
    control_refs,
    evidence_refs,
    owner_team,
    display_order
  )
)
INSERT INTO security_review_artifact (
  id,
  org_id,
  artifact_key,
  artifact_type,
  audience,
  title,
  question,
  answer,
  summary,
  control_family,
  control_refs,
  evidence_refs,
  owner_team,
  display_order,
  state,
  published_at,
  review_due_at
)
SELECT
  seed_rows.id,
  tenant.org_id,
  seed_rows.artifact_key,
  seed_rows.artifact_type,
  'public',
  seed_rows.title,
  seed_rows.question,
  seed_rows.answer,
  seed_rows.summary,
  seed_rows.control_family,
  seed_rows.control_refs,
  seed_rows.evidence_refs,
  seed_rows.owner_team,
  seed_rows.display_order,
  'published',
  now(),
  now() + interval '90 days'
FROM seed_rows
CROSS JOIN tenant
ON CONFLICT (org_id, artifact_key) DO UPDATE SET
  artifact_type = EXCLUDED.artifact_type,
  audience = EXCLUDED.audience,
  title = EXCLUDED.title,
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  summary = EXCLUDED.summary,
  control_family = EXCLUDED.control_family,
  control_refs = EXCLUDED.control_refs,
  evidence_refs = EXCLUDED.evidence_refs,
  owner_team = EXCLUDED.owner_team,
  display_order = EXCLUDED.display_order,
  state = EXCLUDED.state,
  published_at = COALESCE(security_review_artifact.published_at, now()),
  review_due_at = EXCLUDED.review_due_at,
  updated_at = now();
