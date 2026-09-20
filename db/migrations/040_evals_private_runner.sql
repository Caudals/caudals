-- WP-12. Apply after 039 with the serialized migration owner.
BEGIN;

CREATE TABLE evals.runner_pairing (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 project_id uuid NOT NULL, target_id uuid NOT NULL, code_hash text NOT NULL UNIQUE CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,target_id) REFERENCES evals.target(org_id,id)
);
CREATE TABLE evals.runner_identity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 project_id uuid NOT NULL, target_id uuid NOT NULL, public_key text NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), token_expires_at timestamptz NOT NULL,
 connector_version text NOT NULL, revoked_at timestamptz, last_seen_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id),
 FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,target_id) REFERENCES evals.target(org_id,id)
);
CREATE INDEX runner_identity_target ON evals.runner_identity(org_id,target_id,id);
CREATE TABLE evals.runner_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 project_id uuid NOT NULL, runner_id uuid NOT NULL, run_id uuid NOT NULL,
 bundle_hash text NOT NULL CHECK(bundle_hash ~ '^[a-f0-9]{64}$'), bundle jsonb NOT NULL,
 nonce text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','claimed','completed','expired','canceled')),
 claimed_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,run_id),
 FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,runner_id) REFERENCES evals.runner_identity(org_id,id),
 FOREIGN KEY(org_id,run_id) REFERENCES evals.run(org_id,id)
);
CREATE INDEX runner_job_poll ON evals.runner_job(org_id,runner_id,status,created_at,id);
CREATE TABLE evals.runner_submission (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 job_id uuid NOT NULL, case_unit_id uuid NOT NULL, observation_id uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 signature text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,job_id,case_unit_id), UNIQUE(org_id,observation_id),
 FOREIGN KEY(org_id,job_id) REFERENCES evals.runner_job(org_id,id),
 FOREIGN KEY(org_id,case_unit_id) REFERENCES evals.case_unit(org_id,id),
 FOREIGN KEY(org_id,observation_id) REFERENCES evals.observation(org_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['runner_pairing','runner_identity','runner_job','runner_submission'] LOOP
  EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON evals.%I USING (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT ON evals.%I TO evals_runtime',t);
 END LOOP;
END $$;
GRANT UPDATE(consumed_at) ON evals.runner_pairing TO evals_runtime;
GRANT UPDATE(revoked_at,last_seen_at) ON evals.runner_identity TO evals_runtime;
GRANT UPDATE(status,claimed_at,completed_at) ON evals.runner_job TO evals_runtime;
CREATE TRIGGER runner_submission_immutable BEFORE UPDATE OR DELETE ON evals.runner_submission
 FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE FUNCTION evals.runner_job_frozen() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.org_id,NEW.project_id,NEW.runner_id,NEW.run_id,NEW.bundle_hash,NEW.bundle,NEW.nonce,NEW.expires_at)
  IS DISTINCT FROM (OLD.org_id,OLD.project_id,OLD.runner_id,OLD.run_id,OLD.bundle_hash,OLD.bundle,OLD.nonce,OLD.expires_at)
  THEN RAISE EXCEPTION 'immutable private runner job'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER runner_job_frozen BEFORE UPDATE ON evals.runner_job
 FOR EACH ROW EXECUTE FUNCTION evals.runner_job_frozen();
COMMIT;
