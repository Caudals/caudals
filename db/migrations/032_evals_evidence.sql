BEGIN;
-- Requires 031 workspace/identity and the non-owner evals_runtime role.
CREATE FUNCTION evals.reject_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable evidence: create a new revision' USING ERRCODE='55000'; END $$;
CREATE TABLE evals."project" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), description text NOT NULL DEFAULT ''
);
CREATE INDEX ON evals."project"(org_id,created_at,id);
ALTER TABLE evals."project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."project" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."project" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."project" TO evals_runtime;
CREATE TABLE evals."artifact" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), project_id uuid NOT NULL, export_path text NOT NULL, visibility text NOT NULL DEFAULT 'internal' CHECK(visibility IN ('internal','candidate','judge','customer')), UNIQUE(org_id,export_path), object_key text NOT NULL UNIQUE, sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'), byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 1048576), media_type text NOT NULL CHECK (media_type IN ('text/plain','text/markdown','application/vnd.openxmlformats-officedocument.wordprocessingml.document')), state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready')), expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);
CREATE INDEX ON evals."artifact"(org_id,created_at,id);
ALTER TABLE evals."artifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."artifact" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."artifact" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."artifact" TO evals_runtime;
CREATE TABLE evals."target" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), project_id uuid NOT NULL, title text NOT NULL, FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);
CREATE INDEX ON evals."target"(org_id,created_at,id);
ALTER TABLE evals."target" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."target" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."target" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."target" TO evals_runtime;
CREATE TABLE evals."target_revision" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), target_id uuid NOT NULL, content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), document jsonb NOT NULL, FOREIGN KEY(org_id,target_id) REFERENCES evals.target(org_id,id)
);
CREATE INDEX ON evals."target_revision"(org_id,created_at,id);
ALTER TABLE evals."target_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."target_revision" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."target_revision" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."target_revision" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."target_revision" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals."source" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), project_id uuid NOT NULL, title text NOT NULL, rights text NOT NULL CHECK(rights IN ('customer_owned','licensed','public_domain','caudals_owned')), FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);
CREATE INDEX ON evals."source"(org_id,created_at,id);
ALTER TABLE evals."source" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."source" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."source" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."source" TO evals_runtime;
CREATE TABLE evals."source_revision" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), source_id uuid NOT NULL, artifact_id uuid NOT NULL, content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), document jsonb NOT NULL, extraction_version text NOT NULL, FOREIGN KEY(org_id,source_id) REFERENCES evals.source(org_id,id), FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id)
);
CREATE INDEX ON evals."source_revision"(org_id,created_at,id);
ALTER TABLE evals."source_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."source_revision" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."source_revision" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."source_revision" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."source_revision" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals."source_chunk" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), source_revision_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal>=0), excerpt text NOT NULL CHECK(length(excerpt)<=4096), anchor jsonb NOT NULL, UNIQUE(org_id,source_revision_id,ordinal), FOREIGN KEY(org_id,source_revision_id) REFERENCES evals.source_revision(org_id,id)
);
CREATE INDEX ON evals."source_chunk"(org_id,created_at,id);
ALTER TABLE evals."source_chunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."source_chunk" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."source_chunk" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."source_chunk" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."source_chunk" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals."rubric_revision" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), project_id uuid NOT NULL, content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), document jsonb NOT NULL, FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);
CREATE INDEX ON evals."rubric_revision"(org_id,created_at,id);
ALTER TABLE evals."rubric_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."rubric_revision" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."rubric_revision" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."rubric_revision" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."rubric_revision" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals."case" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), project_id uuid NOT NULL, FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);
CREATE INDEX ON evals."case"(org_id,created_at,id);
ALTER TABLE evals."case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."case" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."case" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."case" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."case" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals."case_revision" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), rubric_revision_id uuid NOT NULL, FOREIGN KEY(org_id,rubric_revision_id) REFERENCES evals.rubric_revision(org_id,id), case_id uuid NOT NULL, family_id text NOT NULL, split text NOT NULL CHECK(split IN ('development','validation','holdout','training')), content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), document jsonb NOT NULL, FOREIGN KEY(org_id,case_id) REFERENCES evals."case"(org_id,id)
);
CREATE INDEX ON evals."case_revision"(org_id,created_at,id);
ALTER TABLE evals."case_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."case_revision" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."case_revision" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."case_revision" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."case_revision" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals."suite" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), project_id uuid NOT NULL, title text NOT NULL, draft jsonb NOT NULL DEFAULT '{}'::jsonb, version integer NOT NULL DEFAULT 1 CHECK(version>0), FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);
CREATE INDEX ON evals."suite"(org_id,created_at,id);
ALTER TABLE evals."suite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."suite" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."suite" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."suite" TO evals_runtime;
CREATE TABLE evals."suite_version" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), suite_id uuid NOT NULL, content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), manifest jsonb NOT NULL, UNIQUE(org_id,suite_id,content_hash), FOREIGN KEY(org_id,suite_id) REFERENCES evals.suite(org_id,id)
);
CREATE INDEX ON evals."suite_version"(org_id,created_at,id);
ALTER TABLE evals."suite_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."suite_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."suite_version" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."suite_version" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."suite_version" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals."suite_case" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), suite_version_id uuid NOT NULL, case_revision_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal>=0), UNIQUE(org_id,suite_version_id,case_revision_id), UNIQUE(org_id,suite_version_id,ordinal), FOREIGN KEY(org_id,suite_version_id) REFERENCES evals.suite_version(org_id,id), FOREIGN KEY(org_id,case_revision_id) REFERENCES evals.case_revision(org_id,id)
);
CREATE INDEX ON evals."suite_case"(org_id,created_at,id);
ALTER TABLE evals."suite_case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."suite_case" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."suite_case" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."suite_case" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."suite_case" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals."evidence_request" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id), route text NOT NULL, request_key text NOT NULL CHECK(length(request_key) BETWEEN 1 AND 200), request_hash text NOT NULL, response jsonb NOT NULL, UNIQUE(org_id,created_by,route,request_key)
);
CREATE INDEX ON evals."evidence_request"(org_id,created_at,id);
ALTER TABLE evals."evidence_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals."evidence_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals."evidence_request" USING (org_id = nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals."evidence_request" TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals."evidence_request" FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals.source_upload (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 source_id uuid NOT NULL, artifact_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,source_id), FOREIGN KEY(org_id,source_id) REFERENCES evals.source(org_id,id),
 FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id));
ALTER TABLE evals.source_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.source_upload FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.source_upload USING(org_id=nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK(org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals.source_upload TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals.source_upload FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
GRANT UPDATE(draft,version,title) ON evals.suite TO evals_runtime;
GRANT UPDATE(state,object_key,expires_at) ON evals.artifact TO evals_runtime;
CREATE FUNCTION evals.guard_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='ready' OR NEW.state<>'ready' OR (to_jsonb(NEW)-ARRAY['state','object_key','expires_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','object_key','expires_at']) THEN
 RAISE EXCEPTION 'immutable artifact metadata' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER artifact_guard BEFORE UPDATE ON evals.artifact FOR EACH ROW EXECUTE FUNCTION evals.guard_artifact();
CREATE TABLE evals.output_schema_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES evals.workspace(id),project_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),document jsonb NOT NULL,
 UNIQUE(org_id,id),FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id));
CREATE INDEX ON evals.output_schema_revision(org_id,created_at,id);
CREATE INDEX ON evals.output_schema_revision(org_id,project_id);
ALTER TABLE evals.output_schema_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.output_schema_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.output_schema_revision USING(org_id=nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK(org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals.output_schema_revision TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals.output_schema_revision FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals.tool_fixture_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES evals.workspace(id),project_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),document jsonb NOT NULL,
 UNIQUE(org_id,id),FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id));
CREATE INDEX ON evals.tool_fixture_revision(org_id,created_at,id);
CREATE INDEX ON evals.tool_fixture_revision(org_id,project_id);
ALTER TABLE evals.tool_fixture_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.tool_fixture_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.tool_fixture_revision USING(org_id=nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK(org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals.tool_fixture_revision TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals.tool_fixture_revision FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TABLE evals.suite_artifact (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES evals.workspace(id),suite_version_id uuid NOT NULL,artifact_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 UNIQUE(org_id,id),UNIQUE(org_id,suite_version_id,artifact_id),
 FOREIGN KEY(org_id,suite_version_id) REFERENCES evals.suite_version(org_id,id),FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id));
CREATE INDEX ON evals.suite_artifact(org_id,created_at,id);
CREATE INDEX ON evals.suite_artifact(org_id,artifact_id);
ALTER TABLE evals.suite_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.suite_artifact FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.suite_artifact USING(org_id=nullif(current_setting('evals.org_id',true),'')::uuid) WITH CHECK(org_id=nullif(current_setting('evals.org_id',true),'')::uuid);
GRANT SELECT,INSERT ON evals.suite_artifact TO evals_runtime;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON evals.suite_artifact FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE FUNCTION evals.validate_suite_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM evals.suite_version v JOIN evals.suite s ON s.org_id=v.org_id AND s.id=v.suite_id JOIN evals.artifact a ON a.org_id=s.org_id AND a.project_id=s.project_id, jsonb_array_elements(v.manifest->'files') f WHERE v.org_id=NEW.org_id AND v.id=NEW.suite_version_id AND a.id=NEW.artifact_id AND a.state='ready' AND a.export_path=f->>'path' AND a.sha256=f->>'sha256' AND a.byte_size=(f->>'size_bytes')::integer) THEN RAISE EXCEPTION 'artifact not bound to frozen manifest'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER suite_artifact_binding BEFORE INSERT ON evals.suite_artifact FOR EACH ROW EXECUTE FUNCTION evals.validate_suite_artifact();
CREATE FUNCTION evals.validate_suite_release() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ref jsonb; project uuid;
BEGIN
 SELECT project_id INTO STRICT project FROM evals.suite WHERE org_id=NEW.org_id AND id=NEW.suite_id;
 IF NEW.manifest->>'suite_id' IS DISTINCT FROM NEW.suite_id::text OR NEW.manifest->>'suite_version_id' IS DISTINCT FROM NEW.id::text OR NEW.manifest->>'content_hash' IS DISTINCT FROM NEW.content_hash THEN RAISE EXCEPTION 'manifest identity mismatch'; END IF;
 IF COALESCE(jsonb_array_length(NEW.manifest->'case_revisions'),0) < 1 THEN RAISE EXCEPTION 'empty suite'; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(NEW.manifest->'case_revisions') LOOP
 IF NOT EXISTS(SELECT 1 FROM evals.case_revision r JOIN evals."case" c ON c.org_id=r.org_id AND c.id=r.case_id WHERE r.org_id=NEW.org_id AND c.project_id=project AND r.id=(ref->>'revision_id')::uuid AND r.case_id=(ref->>'case_id')::uuid AND r.content_hash=ref->>'content_hash' AND r.family_id=ref->>'family_id' AND r.split=ref->>'split') THEN RAISE EXCEPTION 'invalid case reference'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.manifest->'case_revisions') r GROUP BY r->>'family_id' HAVING count(DISTINCT r->>'split')>1) THEN RAISE EXCEPTION 'family split overlap'; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(NEW.manifest->'source_revisions') LOOP
 IF NOT EXISTS(SELECT 1 FROM evals.source_revision r JOIN evals.source s ON s.org_id=r.org_id AND s.id=r.source_id WHERE r.org_id=NEW.org_id AND s.project_id=project AND r.id=(ref->>'revision_id')::uuid AND r.content_hash=ref->>'content_hash') THEN RAISE EXCEPTION 'invalid source reference'; END IF;
 END LOOP;
 FOR ref IN SELECT value FROM jsonb_array_elements(NEW.manifest->'rubric_revisions') LOOP
 IF NOT EXISTS(SELECT 1 FROM evals.rubric_revision r WHERE r.org_id=NEW.org_id AND r.project_id=project AND r.id=(ref->>'revision_id')::uuid AND r.content_hash=ref->>'content_hash') THEN RAISE EXCEPTION 'invalid rubric reference'; END IF;
 END LOOP;
 FOR ref IN SELECT value FROM jsonb_array_elements(NEW.manifest->'output_schema_revisions') LOOP
 IF NOT EXISTS(SELECT 1 FROM evals.output_schema_revision r WHERE r.org_id=NEW.org_id AND r.project_id=project AND r.id=(ref->>'revision_id')::uuid AND r.content_hash=ref->>'content_hash') THEN RAISE EXCEPTION 'invalid output_schema_revision reference'; END IF;
 END LOOP;
 FOR ref IN SELECT value FROM jsonb_array_elements(NEW.manifest->'fixture_revisions') LOOP
 IF NOT EXISTS(SELECT 1 FROM evals.tool_fixture_revision r WHERE r.org_id=NEW.org_id AND r.project_id=project AND r.id=(ref->>'revision_id')::uuid AND r.content_hash=ref->>'content_hash') THEN RAISE EXCEPTION 'invalid tool_fixture_revision reference'; END IF;
 END LOOP;
 FOR ref IN SELECT value FROM jsonb_array_elements(NEW.manifest->'files') LOOP
 IF NOT EXISTS(SELECT 1 FROM evals.artifact a WHERE a.org_id=NEW.org_id AND a.project_id=project AND a.export_path=ref->>'path' AND a.sha256=ref->>'sha256' AND a.byte_size=(ref->>'size_bytes')::integer AND a.state='ready' AND a.expires_at>now()) THEN RAISE EXCEPTION 'invalid manifest artifact'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER suite_release_refs BEFORE INSERT ON evals.suite_version FOR EACH ROW EXECUTE FUNCTION evals.validate_suite_release();
CREATE FUNCTION evals.validate_suite_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE manifest jsonb;
BEGIN
 SELECT v.manifest INTO STRICT manifest FROM evals.suite_version v WHERE v.org_id=NEW.org_id AND v.id=NEW.suite_version_id;
 IF (manifest->'case_revisions'->NEW.ordinal->>'revision_id') IS DISTINCT FROM NEW.case_revision_id::text THEN RAISE EXCEPTION 'frozen membership mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER suite_member_refs BEFORE INSERT ON evals.suite_case FOR EACH ROW EXECUTE FUNCTION evals.validate_suite_member();
CREATE FUNCTION evals.validate_source_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM evals.source s JOIN evals.artifact a ON a.org_id=s.org_id AND a.project_id=s.project_id WHERE s.org_id=NEW.org_id AND s.id=NEW.source_id AND a.id=NEW.artifact_id) THEN RAISE EXCEPTION 'source artifact project mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER source_binding BEFORE INSERT ON evals.source_upload FOR EACH ROW EXECUTE FUNCTION evals.validate_source_binding();
CREATE TRIGGER source_binding BEFORE INSERT ON evals.source_revision FOR EACH ROW EXECUTE FUNCTION evals.validate_source_binding();

CREATE TRIGGER artifact_no_delete BEFORE DELETE ON evals.artifact FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE FUNCTION evals.validate_chunk() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM evals.source_revision r, jsonb_array_elements(r.document->'anchors') a WHERE r.org_id=NEW.org_id AND r.id=NEW.source_revision_id AND a->>'id'=NEW.id::text AND a->>'excerpt'=NEW.excerpt AND a->>'locator'='utf16:'||(NEW.anchor->>'start')||':'||(NEW.anchor->>'end')) THEN RAISE EXCEPTION 'chunk not bound to immutable source document'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER chunk_anchor BEFORE INSERT ON evals.source_chunk FOR EACH ROW EXECUTE FUNCTION evals.validate_chunk();
CREATE INDEX ON evals."artifact"(org_id,project_id);
CREATE INDEX ON evals."target"(org_id,project_id);
CREATE INDEX ON evals."target_revision"(org_id,target_id);
CREATE INDEX ON evals."source"(org_id,project_id);
CREATE INDEX ON evals."source_revision"(org_id,source_id);
CREATE INDEX ON evals."source_revision"(org_id,artifact_id);
CREATE INDEX ON evals."rubric_revision"(org_id,project_id);
CREATE INDEX ON evals."case"(org_id,project_id);
CREATE INDEX ON evals."case_revision"(org_id,case_id);
CREATE INDEX ON evals."case_revision"(org_id,rubric_revision_id);
CREATE INDEX ON evals."suite"(org_id,project_id);
CREATE INDEX ON evals."suite_case"(org_id,case_revision_id);
CREATE INDEX ON evals."source_upload"(org_id,artifact_id);
COMMIT;
