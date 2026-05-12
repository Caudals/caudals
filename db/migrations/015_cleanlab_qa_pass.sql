-- M2 Cleanlab / confident-learning QA pass.
-- Records the scan that feeds the G-6 labeling gate and QA scorecard evidence.

CREATE TABLE IF NOT EXISTS cleanlab_qa_pass (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'cq')),
  org_id text NOT NULL REFERENCES organization(id),
  qa_report_id text NOT NULL REFERENCES qa_report(id),
  label_batch_id text REFERENCES label_batch(id),
  build_id text REFERENCES build(id),
  scan_strategy text NOT NULL CHECK (scan_strategy IN (
    'confident_learning',
    'cleanlab_studio',
    'hybrid_confidence_agreement'
  )),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN (
    'draft','scanning','review','requeue','accepted','blocked'
  )),
  input_manifest_uri text NOT NULL,
  cleanlab_report_uri text NOT NULL,
  model_snapshot_uri text NOT NULL,
  scanned_count integer NOT NULL CHECK (scanned_count > 0),
  suspected_label_errors integer NOT NULL CHECK (suspected_label_errors >= 0),
  estimated_error_rate numeric(6,5) NOT NULL CHECK (
    estimated_error_rate >= 0 AND estimated_error_rate <= 1
  ),
  error_rate_threshold numeric(6,5) NOT NULL DEFAULT 0.02000 CHECK (
    error_rate_threshold >= 0 AND error_rate_threshold <= 1
  ),
  requeue_count integer NOT NULL DEFAULT 0 CHECK (requeue_count >= 0),
  requeue_manifest_uri text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CONSTRAINT cleanlab_qa_pass_errors_lte_scanned_check
    CHECK (suspected_label_errors <= scanned_count),
  CONSTRAINT cleanlab_qa_pass_requeue_lte_errors_check
    CHECK (requeue_count <= suspected_label_errors),
  CONSTRAINT cleanlab_qa_pass_requeue_manifest_check
    CHECK (state <> 'requeue' OR (requeue_count > 0 AND char_length(requeue_manifest_uri) > 1)),
  CONSTRAINT cleanlab_qa_pass_accepted_threshold_check
    CHECK (state <> 'accepted' OR estimated_error_rate <= error_rate_threshold)
);

CREATE TABLE IF NOT EXISTS cleanlab_label_issue (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'li')),
  org_id text NOT NULL REFERENCES organization(id),
  cleanlab_qa_pass_id text NOT NULL REFERENCES cleanlab_qa_pass(id) ON DELETE CASCADE,
  item_ref text NOT NULL,
  observed_label text NOT NULL,
  suggested_label text,
  issue_score numeric(5,4) NOT NULL CHECK (issue_score >= 0 AND issue_score <= 1),
  confidence numeric(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  issue_reason text NOT NULL,
  route_state text NOT NULL DEFAULT 'suspected' CHECK (
    route_state IN ('suspected','requeued','dismissed','confirmed')
  ),
  reviewer_priority integer NOT NULL DEFAULT 0 CHECK (reviewer_priority >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  UNIQUE (cleanlab_qa_pass_id, item_ref)
);

CREATE INDEX IF NOT EXISTS cleanlab_qa_pass_report_idx
  ON cleanlab_qa_pass (qa_report_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS cleanlab_label_issue_pass_idx
  ON cleanlab_label_issue (cleanlab_qa_pass_id, route_state, reviewer_priority);

DROP TRIGGER IF EXISTS cleanlab_qa_pass_touch_updated_at ON cleanlab_qa_pass;
CREATE TRIGGER cleanlab_qa_pass_touch_updated_at
  BEFORE UPDATE ON cleanlab_qa_pass
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

DROP TRIGGER IF EXISTS cleanlab_label_issue_touch_updated_at ON cleanlab_label_issue;
CREATE TRIGGER cleanlab_label_issue_touch_updated_at
  BEFORE UPDATE ON cleanlab_label_issue
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

CREATE OR REPLACE FUNCTION app_private.sync_cleanlab_qa_pass_to_qa_report()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE qa_report
  SET
    dimensions = dimensions || jsonb_build_object(
      'cleanlab',
      jsonb_strip_nulls(jsonb_build_object(
        'pass_id', NEW.id,
        'state', NEW.state,
        'scan_strategy', NEW.scan_strategy,
        'scanned_count', NEW.scanned_count,
        'suspected_label_errors', NEW.suspected_label_errors,
        'estimated_error_rate', NEW.estimated_error_rate,
        'error_rate_threshold', NEW.error_rate_threshold,
        'requeue_count', NEW.requeue_count,
        'cleanlab_report_uri', NEW.cleanlab_report_uri,
        'requeue_manifest_uri', NEW.requeue_manifest_uri
      ))
    ),
    updated_at = now()
  WHERE id = NEW.qa_report_id
    AND org_id = NEW.org_id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cleanlab_qa_pass_sync_report ON cleanlab_qa_pass;
CREATE TRIGGER cleanlab_qa_pass_sync_report
  AFTER INSERT OR UPDATE OF state, scan_strategy, scanned_count, suspected_label_errors,
    estimated_error_rate, error_rate_threshold, requeue_count, cleanlab_report_uri,
    requeue_manifest_uri
  ON cleanlab_qa_pass
  FOR EACH ROW EXECUTE FUNCTION app_private.sync_cleanlab_qa_pass_to_qa_report();

ALTER TABLE cleanlab_qa_pass ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleanlab_label_issue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cleanlab_qa_pass_operator_scope ON cleanlab_qa_pass;
CREATE POLICY cleanlab_qa_pass_operator_scope ON cleanlab_qa_pass
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());

DROP POLICY IF EXISTS cleanlab_label_issue_operator_scope ON cleanlab_label_issue;
CREATE POLICY cleanlab_label_issue_operator_scope ON cleanlab_label_issue
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
