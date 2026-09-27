-- Notification engine: every job start, finish and failure becomes an in-app
-- notice, whichever worker or request changed its state, and each person
-- keeps their own read state.
--
-- Triggers write notices on status transitions of website captures, document
-- extraction, test-set generation, runs and exports. They run as the table
-- owner so every service role produces notices without direct INSERT grants.
-- Event IDs are deterministic (kind:subject:state), so a transition that is
-- replayed or also recorded by application code creates one notice.
BEGIN;

CREATE TABLE evals.notification_read (
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  notification_id uuid NOT NULL,
  user_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, notification_id, user_id),
  FOREIGN KEY (org_id, notification_id) REFERENCES evals.notification(org_id, id)
);
ALTER TABLE evals.notification_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.notification_read FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_read_own ON evals.notification_read
  USING (org_id = nullif(current_setting('evals.org_id', true), '')::uuid AND user_id = evals.actor_id())
  WITH CHECK (org_id = nullif(current_setting('evals.org_id', true), '')::uuid AND user_id = evals.actor_id());
REVOKE ALL ON evals.notification_read FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON evals.notification_read TO evals_runtime;
CREATE INDEX notification_recent ON evals.notification(org_id, created_at DESC);

CREATE FUNCTION evals.record_notice(p_org uuid, p_event text, p_kind text, p_payload jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  INSERT INTO evals.notification(org_id, event_id, kind, audience, payload, status, delivered_at)
  VALUES (p_org, p_event, p_kind, 'workspace', p_payload, 'delivered', now())
  ON CONFLICT (org_id, event_id, audience) DO NOTHING
$$;
REVOKE ALL ON FUNCTION evals.record_notice(uuid, text, text, jsonb) FROM PUBLIC;

CREATE FUNCTION evals.notify_job_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  v_eval uuid; v_title text; v_subject text; v_kind text; v_state text := NEW.status;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'website_source_job' THEN
    v_eval := NEW.evaluation_id;
    SELECT title INTO v_subject FROM evals.source WHERE org_id = NEW.org_id AND id = NEW.source_id;
    v_kind := CASE NEW.status WHEN 'running' THEN 'website_started' WHEN 'completed' THEN 'website_ready' WHEN 'failed' THEN 'website_failed' END;
  ELSIF TG_TABLE_NAME = 'source_ingestion_job' THEN
    SELECT s.evaluation_id, s.title INTO v_eval, v_subject FROM evals.source s WHERE s.org_id = NEW.org_id AND s.id = NEW.source_id;
    -- Website captures are extracted too; their capture job already reports.
    IF EXISTS (SELECT 1 FROM evals.website_source_job w WHERE w.org_id = NEW.org_id AND w.source_id = NEW.source_id) THEN RETURN NEW; END IF;
    v_kind := CASE NEW.status WHEN 'completed' THEN 'document_ready' WHEN 'failed' THEN 'document_failed' END;
  ELSIF TG_TABLE_NAME = 'generation_job' THEN
    v_eval := NEW.evaluation_id;
    v_kind := CASE NEW.status
      WHEN 'profiling' THEN 'generation_started'
      WHEN 'needs_input' THEN 'input_required'
      WHEN 'needs_review' THEN 'test_set_ready'
      WHEN 'quarantined' THEN 'generation_failed'
      WHEN 'failed' THEN 'generation_failed'
      WHEN 'paused' THEN 'generation_paused' END;
  ELSIF TG_TABLE_NAME = 'run' THEN
    v_eval := NEW.evaluation_id;
    v_kind := CASE NEW.status
      WHEN 'running' THEN 'run_started'
      -- Completion is announced once, as report_published, with the results link.
      WHEN 'failed' THEN 'run_failed'
      WHEN 'canceled' THEN 'run_canceled'
      WHEN 'paused' THEN 'run_paused' END;
  ELSIF TG_TABLE_NAME = 'export_job' THEN
    SELECT r.evaluation_id INTO v_eval FROM evals.report_revision rr JOIN evals.run r ON (r.org_id, r.id) = (rr.org_id, rr.run_id)
      WHERE rr.org_id = NEW.org_id AND rr.id = NEW.report_revision_id;
    v_kind := CASE NEW.status WHEN 'completed' THEN 'export_completed' WHEN 'failed' THEN 'export_failed' END;
  END IF;
  IF v_kind IS NULL THEN RETURN NEW; END IF;
  IF v_eval IS NOT NULL THEN SELECT title INTO v_title FROM evals.evaluation WHERE org_id = NEW.org_id AND id = v_eval; END IF;
  PERFORM evals.record_notice(
    NEW.org_id,
    CASE TG_TABLE_NAME WHEN 'export_job' THEN 'export' WHEN 'run' THEN 'run' ELSE TG_TABLE_NAME END || ':' || NEW.id || ':' || v_state,
    v_kind,
    jsonb_strip_nulls(jsonb_build_object(
      'subjectType', TG_TABLE_NAME, 'subjectId', NEW.id, 'evaluationId', v_eval, 'evaluationTitle', v_title,
      'subjectTitle', v_subject, 'status', v_state,
      'reasonCode', CASE WHEN TG_TABLE_NAME IN ('website_source_job','source_ingestion_job','generation_job','run','export_job') THEN to_jsonb(NEW)->>'reason_code' END,
      'exportKind', CASE WHEN TG_TABLE_NAME = 'export_job' THEN to_jsonb(NEW)->>'kind' END,
      'exportJobId', CASE WHEN TG_TABLE_NAME = 'export_job' THEN NEW.id END)));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION evals.notify_job_transition() FROM PUBLIC;

CREATE TRIGGER website_source_job_notice AFTER INSERT OR UPDATE OF status ON evals.website_source_job FOR EACH ROW EXECUTE FUNCTION evals.notify_job_transition();
CREATE TRIGGER source_ingestion_job_notice AFTER UPDATE OF status ON evals.source_ingestion_job FOR EACH ROW EXECUTE FUNCTION evals.notify_job_transition();
CREATE TRIGGER generation_job_notice AFTER INSERT OR UPDATE OF status ON evals.generation_job FOR EACH ROW EXECUTE FUNCTION evals.notify_job_transition();
CREATE TRIGGER run_notice AFTER UPDATE OF status ON evals.run FOR EACH ROW EXECUTE FUNCTION evals.notify_job_transition();
CREATE TRIGGER export_job_notice AFTER UPDATE OF status ON evals.export_job FOR EACH ROW EXECUTE FUNCTION evals.notify_job_transition();

-- Email covers the new milestones too, under the same per-person categories.
CREATE OR REPLACE FUNCTION evals.notification_email_recipients(p_org_id uuid, p_kind text)
 RETURNS TABLE(user_id text, email text)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'evals', 'public'
AS $function$
  SELECT m.user_id, u.email
  FROM evals.membership m
  JOIN public.auth_user u ON u.id=m.user_id AND u."emailVerified"
  JOIN evals.notification_preference p ON p.org_id=m.org_id AND p.user_id=m.user_id AND p.email
  WHERE m.org_id=p_org_id AND p_org_id=evals.org_id()
    AND CASE
      WHEN p_kind IN ('report_published','test_set_ready') THEN p.completion
      WHEN p_kind IN ('run_failed','generation_failed','website_failed','document_failed','export_failed') THEN p.failure
      WHEN p_kind = 'input_required' THEN p.required_input
      ELSE false END
$function$;

COMMIT;
