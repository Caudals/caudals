-- WP-07: immutable report snapshots, checked exports, private shares and notifications.
BEGIN;
ALTER TABLE evals.artifact DROP CONSTRAINT IF EXISTS artifact_byte_size_check;
ALTER TABLE evals.artifact ADD CONSTRAINT artifact_byte_size_check CHECK(byte_size BETWEEN 1 AND 26214400);
ALTER TABLE evals.artifact DROP CONSTRAINT IF EXISTS artifact_media_type_check;
ALTER TABLE evals.artifact ADD CONSTRAINT artifact_media_type_check CHECK(media_type IN ('text/plain','text/markdown','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/pdf','text/csv','application/json','application/x-ndjson','application/zip','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
CREATE TABLE evals.report (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id), project_id uuid NOT NULL,
 title text NOT NULL, publication_status text NOT NULL DEFAULT 'draft' CHECK(publication_status IN ('draft','published','superseded','withdrawn')),
 current_revision_id uuid, created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);
CREATE INDEX report_page ON evals.report(org_id,updated_at DESC,id);
CREATE TABLE evals.report_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, report_id uuid NOT NULL, run_id uuid NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), snapshot jsonb NOT NULL,
 review_status text NOT NULL CHECK(review_status IN ('preliminary','reviewed')), published_at timestamptz,
 supersedes_revision_id uuid, created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,report_id,content_hash), FOREIGN KEY(org_id,report_id) REFERENCES evals.report(org_id,id),
 FOREIGN KEY(org_id,run_id) REFERENCES evals.run(org_id,id), FOREIGN KEY(org_id,supersedes_revision_id) REFERENCES evals.report_revision(org_id,id)
);
ALTER TABLE evals.report ADD CONSTRAINT report_current_revision_fk FOREIGN KEY(org_id,current_revision_id) REFERENCES evals.report_revision(org_id,id);
CREATE TABLE evals.report_artifact (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, report_revision_id uuid NOT NULL, artifact_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('pdf','csv','cef','comparison_pdf','comparison_json')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,report_revision_id,kind), FOREIGN KEY(org_id,report_revision_id) REFERENCES evals.report_revision(org_id,id),
 FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id)
);
CREATE TABLE evals.share_grant (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, report_revision_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), recipient text, audience text NOT NULL CHECK(audience IN ('workspace','named_recipient','bearer')),
 permitted_fields jsonb NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,report_revision_id) REFERENCES evals.report_revision(org_id,id)
);
CREATE INDEX share_expiry ON evals.share_grant(expires_at) WHERE revoked_at IS NULL;
CREATE TABLE evals.share_access_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id uuid NOT NULL, share_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('view','download','denied')), request_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,share_id) REFERENCES evals.share_grant(org_id,id)
);
CREATE TABLE evals.export_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, report_revision_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('pdf','csv','cef')), status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
 artifact_id uuid, reason_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,report_revision_id) REFERENCES evals.report_revision(org_id,id), FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id)
);
CREATE TABLE evals.notification (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id), event_id text NOT NULL,
 kind text NOT NULL, audience text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz, UNIQUE(org_id,id), UNIQUE(org_id,event_id,audience)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['report','report_revision','report_artifact','share_grant','share_access_event','export_job','notification'] LOOP
  EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON evals.%I USING (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT ON evals.%I TO evals_runtime',t);
 END LOOP;
END $$;
GRANT UPDATE(publication_status,current_revision_id,updated_at) ON evals.report TO evals_runtime;
GRANT UPDATE(revoked_at) ON evals.share_grant TO evals_runtime;
GRANT UPDATE(status,artifact_id,reason_code,updated_at) ON evals.export_job TO evals_runtime;
GRANT UPDATE(status,delivered_at) ON evals.notification TO evals_runtime;
CREATE TRIGGER report_revision_immutable BEFORE UPDATE OR DELETE ON evals.report_revision FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER report_artifact_immutable BEFORE UPDATE OR DELETE ON evals.report_artifact FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER share_access_immutable BEFORE UPDATE OR DELETE ON evals.share_access_event FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();

-- Resolve a high-entropy bearer hash without granting cross-tenant table access.
CREATE FUNCTION evals.resolve_share(p_token_hash text, p_request_id text, p_action text DEFAULT 'view')
RETURNS TABLE(org_id uuid, share_id uuid, report_revision_id uuid, permitted_fields jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
DECLARE g evals.share_grant%ROWTYPE;
BEGIN
 IF p_token_hash !~ '^[a-f0-9]{64}$' OR p_action NOT IN ('view','download') THEN RETURN; END IF;
 SELECT s.* INTO g FROM evals.share_grant s JOIN evals.report_revision rr ON (rr.org_id,rr.id)=(s.org_id,s.report_revision_id) JOIN evals.report r ON (r.org_id,r.current_revision_id)=(rr.org_id,rr.id) WHERE s.token_hash=p_token_hash AND s.audience='bearer' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND r.publication_status='published';
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO evals.share_access_event(org_id,share_id,action,request_id) VALUES(g.org_id,g.id,p_action,left(p_request_id,200));
 RETURN QUERY SELECT g.org_id,g.id,g.report_revision_id,g.permitted_fields;
END $$;
REVOKE ALL ON FUNCTION evals.resolve_share(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.resolve_share(text,text,text) TO evals_runtime;
COMMIT;
