-- Private share links can download the report too. A shared PDF is rendered
-- by the document worker like any other, but from the share's allowlisted
-- sections only, so the job records which share it serves and the sections
-- it may show. These jobs never replace the workspace's own report files and
-- never notify the workspace. Polling a queued PDF checks the link without
-- counting another access.
BEGIN;
ALTER TABLE evals.export_job ADD COLUMN share_id uuid;
ALTER TABLE evals.export_job ADD COLUMN permitted_fields jsonb;
ALTER TABLE evals.export_job ADD CONSTRAINT export_job_share_fk FOREIGN KEY (org_id, share_id) REFERENCES evals.share_grant(org_id, id);
ALTER TABLE evals.export_job ADD CONSTRAINT export_job_share_fields CHECK ((share_id IS NULL) = (permitted_fields IS NULL));
CREATE INDEX export_job_share ON evals.export_job(org_id, share_id, kind, locale) WHERE share_id IS NOT NULL;

DROP TRIGGER export_job_notice ON evals.export_job;
CREATE TRIGGER export_job_notice AFTER UPDATE OF status ON evals.export_job FOR EACH ROW
  WHEN (NEW.share_id IS NULL) EXECUTE FUNCTION evals.notify_job_transition();

CREATE OR REPLACE FUNCTION evals.resolve_share(p_token_hash text, p_request_id text, p_action text DEFAULT 'view')
RETURNS TABLE(org_id uuid, share_id uuid, report_revision_id uuid, permitted_fields jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
DECLARE g evals.share_grant%ROWTYPE;
BEGIN
 IF p_token_hash !~ '^[a-f0-9]{64}$' OR p_action NOT IN ('view','download','status') THEN RETURN; END IF;
 SELECT s.* INTO g FROM evals.share_grant s JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(s.org_id,s.report_revision_id) JOIN evals.report r ON (r.org_id,r.current_revision_id)=(rr.org_id,rr.id) WHERE s.token_hash=p_token_hash AND s.audience='bearer' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND r.publication_status='published';
 IF NOT FOUND THEN RETURN; END IF;
 IF p_action<>'status' THEN
  INSERT INTO evals.share_access_event(org_id,share_id,action,request_id) VALUES(g.org_id,g.id,p_action,left(p_request_id,200));
 END IF;
 RETURN QUERY SELECT g.org_id,g.id,g.report_revision_id,g.permitted_fields;
END $$;
COMMIT;
