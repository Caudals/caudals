-- WP-13. Apply after 040 with the serialized migration owner.
BEGIN;

CREATE TABLE evals.monitor_schedule (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 project_id uuid NOT NULL, evaluation_id uuid NOT NULL, target_revision_id uuid NOT NULL, suite_version_id uuid NOT NULL,
 timezone text NOT NULL CHECK(length(timezone) BETWEEN 1 AND 100),
 cadence text NOT NULL CHECK(cadence IN ('daily','weekly','monthly')),
 local_time time(0) NOT NULL, weekday smallint CHECK(weekday BETWEEN 1 AND 7),
 day_of_month smallint CHECK(day_of_month BETWEEN 1 AND 31),
 max_run_spend numeric(24,9) NOT NULL CHECK(max_run_spend>=0), currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 source_max_age_days integer CHECK(source_max_age_days BETWEEN 1 AND 3650),
 overlap_policy text NOT NULL DEFAULT 'skip' CHECK(overlap_policy='skip'),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
 next_due_at timestamptz NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id),
 FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
 FOREIGN KEY(org_id,evaluation_id) REFERENCES evals.evaluation(org_id,id),
 FOREIGN KEY(org_id,target_revision_id) REFERENCES evals.target_revision(org_id,id),
 FOREIGN KEY(org_id,suite_version_id) REFERENCES evals.suite_version(org_id,id),
 CHECK((cadence='daily' AND weekday IS NULL AND day_of_month IS NULL) OR
       (cadence='weekly' AND weekday IS NOT NULL AND day_of_month IS NULL) OR
       (cadence='monthly' AND weekday IS NULL AND day_of_month IS NOT NULL))
);
CREATE INDEX monitor_schedule_due ON evals.monitor_schedule(org_id,next_due_at,id) WHERE status='active';
CREATE FUNCTION evals.validate_monitor_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_project uuid; suite_project uuid; evaluation_project uuid; suite_mode text; BEGIN
 SELECT project_id INTO evaluation_project FROM evals.evaluation WHERE org_id=NEW.org_id AND id=NEW.evaluation_id;
 SELECT t.project_id INTO target_project FROM evals.target_revision tr JOIN evals.target t
   ON (t.org_id,t.id)=(tr.org_id,tr.target_id) WHERE tr.org_id=NEW.org_id AND tr.id=NEW.target_revision_id;
 SELECT s.project_id,sv.manifest->>'execution_mode' INTO suite_project,suite_mode FROM evals.suite_version sv
   JOIN evals.suite s ON (s.org_id,s.id)=(sv.org_id,sv.suite_id)
   WHERE sv.org_id=NEW.org_id AND sv.id=NEW.suite_version_id;
 IF evaluation_project IS DISTINCT FROM NEW.project_id OR target_project IS DISTINCT FROM NEW.project_id
   OR suite_project IS DISTINCT FROM NEW.project_id OR suite_mode='imported_responses'
 THEN RAISE EXCEPTION 'schedule project or execution scope mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER monitor_schedule_binding BEFORE INSERT OR UPDATE ON evals.monitor_schedule
 FOR EACH ROW EXECUTE FUNCTION evals.validate_monitor_schedule();

CREATE TABLE evals.schedule_dispatch (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 schedule_id uuid NOT NULL, scheduled_for timestamptz NOT NULL, local_slot_key text NOT NULL,
 schedule_version integer NOT NULL CHECK(schedule_version>0),
 target_revision_id uuid NOT NULL, suite_version_id uuid NOT NULL,
 max_run_spend numeric(24,9) NOT NULL CHECK(max_run_spend>=0),
 status text NOT NULL CHECK(status IN ('claimed','starting','started','skipped','failed')),
 reason_code text, run_id uuid, missed_slots integer NOT NULL DEFAULT 0 CHECK(missed_slots>=0),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,schedule_id,scheduled_for), UNIQUE(org_id,schedule_id,local_slot_key),
 FOREIGN KEY(org_id,schedule_id) REFERENCES evals.monitor_schedule(org_id,id),
 FOREIGN KEY(org_id,target_revision_id) REFERENCES evals.target_revision(org_id,id),
 FOREIGN KEY(org_id,suite_version_id) REFERENCES evals.suite_version(org_id,id),
 FOREIGN KEY(org_id,run_id) REFERENCES evals.run(org_id,id)
);
CREATE INDEX schedule_dispatch_retry ON evals.schedule_dispatch(org_id,status,updated_at,id) WHERE status IN ('claimed','starting');

CREATE TABLE evals.webhook_endpoint (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120), url text NOT NULL CHECK(length(url) BETWEEN 9 AND 2048 AND url LIKE 'https://%'),
 events text[] NOT NULL CHECK(events <@ ARRAY['run_completed','run_partial','run_unknown','regression','inconclusive']::text[]),
 enabled boolean NOT NULL DEFAULT true, current_secret_version_id uuid,
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id)
);
CREATE TABLE evals.webhook_secret_version (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 endpoint_id uuid NOT NULL, envelope jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id),
 FOREIGN KEY(org_id,endpoint_id) REFERENCES evals.webhook_endpoint(org_id,id)
);
ALTER TABLE evals.webhook_endpoint ADD CONSTRAINT webhook_current_secret_fk
 FOREIGN KEY(org_id,current_secret_version_id) REFERENCES evals.webhook_secret_version(org_id,id);
CREATE TABLE evals.webhook_delivery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 endpoint_id uuid NOT NULL, secret_version_id uuid NOT NULL, event_id text NOT NULL,
 event_kind text NOT NULL, payload jsonb NOT NULL, payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','retry','delivered','failed')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 last_http_status integer, reason_code text, delivered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,endpoint_id,event_id),
 FOREIGN KEY(org_id,endpoint_id) REFERENCES evals.webhook_endpoint(org_id,id),
 FOREIGN KEY(org_id,secret_version_id) REFERENCES evals.webhook_secret_version(org_id,id)
);
CREATE INDEX webhook_delivery_work ON evals.webhook_delivery(org_id,next_attempt_at,id)
 WHERE status IN ('queued','retry','sending');

CREATE TABLE evals.customer_api_token (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 scopes text[] NOT NULL CHECK(scopes <@ ARRAY['runs:read','reports:read','schedules:read']::text[] AND cardinality(scopes)>0),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, last_used_at timestamptz,
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id)
);
CREATE TABLE evals.regression_alert (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 schedule_dispatch_id uuid NOT NULL, baseline_run_id uuid, candidate_run_id uuid NOT NULL,
 comparison_id uuid, status text NOT NULL CHECK(status IN ('pass','regression','inconclusive','unknown')),
 reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,schedule_dispatch_id),
 FOREIGN KEY(org_id,schedule_dispatch_id) REFERENCES evals.schedule_dispatch(org_id,id),
 FOREIGN KEY(org_id,baseline_run_id) REFERENCES evals.run(org_id,id),
 FOREIGN KEY(org_id,candidate_run_id) REFERENCES evals.run(org_id,id),
 FOREIGN KEY(org_id,comparison_id) REFERENCES evals.comparison(org_id,id)
);
CREATE TABLE evals.crm_handoff_draft (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 report_revision_id uuid NOT NULL, summary jsonb NOT NULL,
 created_by text NOT NULL DEFAULT current_setting('evals.actor_id'), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,report_revision_id),
 FOREIGN KEY(org_id,report_revision_id) REFERENCES evals.report_revision(org_id,id)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['monitor_schedule','schedule_dispatch','webhook_endpoint','webhook_secret_version',
   'webhook_delivery','customer_api_token','regression_alert','crm_handoff_draft'] LOOP
  EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant ON evals.%I USING (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id=nullif(current_setting(''evals.org_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT,INSERT ON evals.%I TO evals_runtime',t);
 END LOOP;
END $$;
GRANT UPDATE(status,next_due_at,version,updated_at,target_revision_id,suite_version_id,max_run_spend,
 source_max_age_days) ON evals.monitor_schedule TO evals_runtime;
GRANT UPDATE(status,reason_code,run_id,attempt_count,updated_at) ON evals.schedule_dispatch TO evals_runtime;
GRANT UPDATE(enabled,current_secret_version_id,events,updated_at) ON evals.webhook_endpoint TO evals_runtime;
GRANT UPDATE(status,attempt_count,next_attempt_at,lease_until,last_http_status,reason_code,delivered_at,updated_at)
 ON evals.webhook_delivery TO evals_runtime;
GRANT UPDATE(revoked_at,last_used_at) ON evals.customer_api_token TO evals_runtime;
-- Workspace budget gates read tenant-filtered accounting, including Stage C self-service runs.
GRANT SELECT ON evals.execution_cost_entry,evals.budget_reservation TO evals_runtime;
CREATE TRIGGER webhook_secret_immutable BEFORE UPDATE OR DELETE ON evals.webhook_secret_version
 FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER regression_alert_immutable BEFORE UPDATE OR DELETE ON evals.regression_alert
 FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER crm_handoff_immutable BEFORE UPDATE OR DELETE ON evals.crm_handoff_draft
 FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
COMMIT;
