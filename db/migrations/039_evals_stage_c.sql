-- Stage C: website recipes, bounded customer entitlements, preferences and
-- regression provenance. Apply additively after 038 as the migration owner.
BEGIN;

CREATE TABLE evals.website_recipe_candidate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES evals.workspace(id),
 project_id uuid NOT NULL,
 target_id uuid NOT NULL,
 target_revision_id uuid NOT NULL,
 connection_check_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('known_recipe','model_proposed','operator_authored')),
 document jsonb,
 discovery_snapshot jsonb,
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN ('queued','discovering','needs_operator','validating','validated','failed')),
 reason_code text,
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id),
 FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,target_id) REFERENCES evals.target(org_id,id),
 FOREIGN KEY(org_id,target_revision_id) REFERENCES evals.target_revision(org_id,id),
 FOREIGN KEY(org_id,connection_check_id) REFERENCES evals.connection_check(org_id,id)
);
CREATE INDEX website_recipe_candidate_work
 ON evals.website_recipe_candidate(org_id,status,updated_at,id);

CREATE TABLE evals.website_recipe_revision (
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES evals.workspace(id),
 project_id uuid NOT NULL,
 target_id uuid NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL,
 probe_evidence jsonb NOT NULL,
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id),
 UNIQUE(org_id,target_id,content_hash),
 FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,target_id) REFERENCES evals.target(org_id,id)
);
CREATE INDEX website_recipe_target
 ON evals.website_recipe_revision(org_id,target_id,created_at DESC,id);

CREATE TABLE evals.browser_login_session (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES evals.workspace(id),
 target_id uuid NOT NULL,
 secret_version_id uuid NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 last_validated_at timestamptz,
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id),
 FOREIGN KEY(org_id,target_id) REFERENCES evals.target(org_id,id),
 FOREIGN KEY(org_id,secret_version_id) REFERENCES evals.secret_version(org_id,id)
);

CREATE TABLE evals.workspace_entitlement (
 org_id uuid PRIMARY KEY REFERENCES evals.workspace(id),
 max_active_runs integer NOT NULL DEFAULT 1 CHECK(max_active_runs BETWEEN 0 AND 100),
 monthly_spend_limit numeric(24,9) NOT NULL DEFAULT 500 CHECK(monthly_spend_limit>=0),
 currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),
 allowed_connection_types text[] NOT NULL DEFAULT ARRAY['website','openai_compatible','https_json','imported_responses']::text[],
 retention_policy text NOT NULL DEFAULT 'managed_90_days',
 can_schedule boolean NOT NULL DEFAULT false,
 can_export boolean NOT NULL DEFAULT true,
 review_allowance integer NOT NULL DEFAULT 0 CHECK(review_allowance>=0),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by text NOT NULL DEFAULT current_setting('evals.actor_id',true),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(allowed_connection_types <@ ARRAY['website','openai_compatible','provider_native','https_json','imported_responses','private_runner']::text[])
);
INSERT INTO evals.workspace_entitlement(org_id,updated_by)
 SELECT id,created_by FROM evals.workspace ON CONFLICT DO NOTHING;
CREATE FUNCTION evals.seed_workspace_entitlement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
BEGIN
 INSERT INTO evals.workspace_entitlement(org_id,updated_by)
 VALUES(NEW.id,NEW.created_by) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER seed_workspace_entitlement
 AFTER INSERT ON evals.workspace FOR EACH ROW
 EXECUTE FUNCTION evals.seed_workspace_entitlement();

CREATE TABLE evals.notification_preference (
 org_id uuid NOT NULL REFERENCES evals.workspace(id),
 user_id text NOT NULL REFERENCES public.auth_user(id),
 completion boolean NOT NULL DEFAULT true,
 required_input boolean NOT NULL DEFAULT true,
 failure boolean NOT NULL DEFAULT true,
 email boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,user_id)
);

CREATE TABLE evals.regression_case (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES evals.workspace(id),
 project_id uuid NOT NULL,
 source_observation_id uuid NOT NULL,
 source_case_revision_id uuid NOT NULL,
 draft_case_revision_id uuid,
 redaction_status text NOT NULL DEFAULT 'pending'
  CHECK(redaction_status IN ('pending','redacted','rejected')),
 validation_status text NOT NULL DEFAULT 'pending'
  CHECK(validation_status IN ('pending','valid','invalid')),
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id),
 UNIQUE(org_id,source_observation_id),
 FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,source_observation_id) REFERENCES evals.observation(org_id,id),
 FOREIGN KEY(org_id,source_case_revision_id) REFERENCES evals.case_revision(org_id,id),
 FOREIGN KEY(org_id,draft_case_revision_id) REFERENCES evals.case_revision(org_id,id)
);

ALTER TABLE evals.evaluation
 ADD COLUMN selected_target_revision_id uuid,
 ADD COLUMN selected_suite_version_id uuid,
 ADD CONSTRAINT evaluation_selected_target_fk
  FOREIGN KEY(org_id,selected_target_revision_id)
  REFERENCES evals.target_revision(org_id,id),
 ADD CONSTRAINT evaluation_selected_suite_fk
  FOREIGN KEY(org_id,selected_suite_version_id)
  REFERENCES evals.suite_version(org_id,id);
GRANT UPDATE(selected_target_revision_id,selected_suite_version_id)
 ON evals.evaluation TO evals_runtime;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'website_recipe_candidate','website_recipe_revision','browser_login_session',
  'workspace_entitlement','notification_preference','regression_case'
 ] LOOP
  EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format(
   'CREATE POLICY tenant ON evals.%I USING (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid)',
   t
  );
  EXECUTE format('GRANT SELECT,INSERT ON evals.%I TO evals_runtime',t);
 END LOOP;
END $$;
GRANT UPDATE(status,reason_code,document,discovery_snapshot,updated_at)
 ON evals.website_recipe_candidate TO evals_runtime;
GRANT UPDATE(revoked_at,last_validated_at) ON evals.browser_login_session TO evals_runtime;
GRANT UPDATE(completion,required_input,failure,email,updated_at)
 ON evals.notification_preference TO evals_runtime;
GRANT UPDATE(redaction_status,validation_status,draft_case_revision_id)
 ON evals.regression_case TO evals_runtime;

CREATE TRIGGER website_recipe_revision_immutable
 BEFORE UPDATE OR DELETE ON evals.website_recipe_revision
 FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();

-- Entitlements are readable by tenant runtime but mutable only by the separate
-- privileged configuration role. Customers cannot raise their own limits.
REVOKE UPDATE,DELETE ON evals.workspace_entitlement FROM evals_runtime;

COMMIT;
