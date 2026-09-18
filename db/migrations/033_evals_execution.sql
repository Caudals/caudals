-- WP-03. Apply after 031/032 using the serialized migration owner.
BEGIN;
CREATE TABLE evals.provider_account (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), ceiling numeric(24,9) NOT NULL CHECK(ceiling>=0),
 settled numeric(24,9) NOT NULL DEFAULT 0 CHECK(settled>=0), reserved numeric(24,9) NOT NULL DEFAULT 0 CHECK(reserved>=0),
 enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evals.provider_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES evals.provider_account,
 adapter text NOT NULL CHECK(adapter IN ('dgx','openai_compatible')), endpoint text NOT NULL,
 model_id text NOT NULL, owner_id text NOT NULL, roles text[] NOT NULL,
 capabilities jsonb NOT NULL, context_limit integer NOT NULL CHECK(context_limit>0), output_limit integer NOT NULL CHECK(output_limit>0),
 data_classes text[] NOT NULL, regions text[] NOT NULL, license_restrictions text,
 concurrency_limit integer NOT NULL DEFAULT 1 CHECK(concurrency_limit BETWEEN 1 AND 16),
 rpm integer NOT NULL CHECK(rpm>0), tpm integer NOT NULL CHECK(tpm>0),
 retired_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(roles <@ ARRAY['target','generator','context_analyzer','judge','adjudicator','report_writer','embedding']::text[])
);
CREATE TABLE evals.provider_health (
 provider_revision_id uuid PRIMARY KEY REFERENCES evals.provider_revision,
 state text NOT NULL DEFAULT 'unprobed' CHECK(state IN ('unprobed','healthy','network_unavailable','service_unavailable','model_missing','overloaded','malformed_output','unsupported_feature','invalid_credentials')),
 circuit_until timestamptz, last_probe_at timestamptz
);
CREATE TABLE evals.price_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_revision_id uuid NOT NULL REFERENCES evals.provider_revision,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), effective_at timestamptz NOT NULL,
 billing_unit text NOT NULL CHECK(billing_unit='token'),
 input_price numeric(24,9) NOT NULL CHECK(input_price>=0), output_price numeric(24,9) NOT NULL CHECK(output_price>=0),
 cache_price numeric(24,9) NOT NULL CHECK(cache_price>=0), tool_price numeric(24,9) NOT NULL CHECK(tool_price>=0),
 uncertainty_bps integer NOT NULL CHECK(uncertainty_bps BETWEEN 0 AND 10000),
 fx_source text, fx_date date, source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evals.secret_record (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 purpose text NOT NULL CHECK(purpose IN ('provider','target')), scope_id uuid NOT NULL,
 revoked_at timestamptz, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id)
);
CREATE TABLE evals.secret_version (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, record_id uuid NOT NULL,
 envelope jsonb NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), FOREIGN KEY(org_id,record_id) REFERENCES evals.secret_record(org_id,id)
);
CREATE TABLE evals.execution_budget (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id),
 kind text NOT NULL CHECK(kind IN ('workspace','run')), scope_id uuid NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), ceiling numeric(24,9) NOT NULL CHECK(ceiling>=0),
 settled numeric(24,9) NOT NULL DEFAULT 0 CHECK(settled>=0), reserved numeric(24,9) NOT NULL DEFAULT 0 CHECK(reserved>=0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id), UNIQUE(org_id,kind,scope_id),
 CHECK(kind<>'workspace' OR scope_id=org_id)
);
CREATE TABLE evals.execution_workflow (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES evals.workspace(id), run_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','pause_requested','paused','cancel_requested','canceled','completed','partial','failed')),
 phase text NOT NULL DEFAULT 'preflight', reason_code text,
 plan_hash text NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'), created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id), UNIQUE(org_id,run_id)
);
CREATE TABLE evals.workflow_step (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, workflow_id uuid NOT NULL,
 step_kind text NOT NULL, input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'), version integer NOT NULL CHECK(version>0),
 -- Frozen worker input: bounded messages, provider/price/secret refs, policy and budget refs. Never credentials.
 input jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','canceled','unknown','paused')),
 fence bigint NOT NULL DEFAULT 0, lease_owner uuid, lease_until timestamptz,
 not_before timestamptz NOT NULL DEFAULT now(), reason_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id), UNIQUE(org_id,workflow_id,step_kind,input_hash,version), FOREIGN KEY(org_id,workflow_id) REFERENCES evals.execution_workflow(org_id,id)
);
CREATE TABLE evals.execution_attempt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, step_id uuid NOT NULL,
 fence bigint NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 3),
 provider_revision_id uuid NOT NULL REFERENCES evals.provider_revision, price_revision_id uuid NOT NULL REFERENCES evals.price_revision,
 status text NOT NULL CHECK(status IN ('reserved','dispatching','completed','failed','unknown','canceled')),
 token_bound integer NOT NULL CHECK(token_bound>0), dispatched_at timestamptz, finished_at timestamptz,
 reason_code text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id), UNIQUE(org_id,step_id,ordinal),
 FOREIGN KEY(org_id,step_id) REFERENCES evals.workflow_step(org_id,id)
);
CREATE TABLE evals.budget_reservation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, attempt_id uuid NOT NULL,
 account_id uuid NOT NULL REFERENCES evals.provider_account, workspace_budget_id uuid NOT NULL, run_budget_id uuid NOT NULL,
 amount numeric(24,9) NOT NULL CHECK(amount>=0), actual numeric(24,9) CHECK(actual>=0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','unresolved','settled','released')),
 provenance text, created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
 UNIQUE(org_id,id), UNIQUE(org_id,attempt_id),
 FOREIGN KEY(org_id,attempt_id) REFERENCES evals.execution_attempt(org_id,id),
 FOREIGN KEY(org_id,workspace_budget_id) REFERENCES evals.execution_budget(org_id,id),
 FOREIGN KEY(org_id,run_budget_id) REFERENCES evals.execution_budget(org_id,id)
);
CREATE TABLE evals.execution_result (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, step_id uuid NOT NULL, attempt_id uuid NOT NULL,
 output jsonb NOT NULL, output_hash text NOT NULL CHECK(output_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,step_id), UNIQUE(org_id,attempt_id),
 FOREIGN KEY(org_id,step_id) REFERENCES evals.workflow_step(org_id,id), FOREIGN KEY(org_id,attempt_id) REFERENCES evals.execution_attempt(org_id,id)
);
CREATE TABLE evals.execution_cost_entry (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, reservation_id uuid NOT NULL,
 amount numeric(24,9) NOT NULL CHECK(amount>=0), provenance text NOT NULL, internal_estimate numeric(24,9) NOT NULL DEFAULT 0 CHECK(internal_estimate>=0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,reservation_id), FOREIGN KEY(org_id,reservation_id) REFERENCES evals.budget_reservation(org_id,id)
);
CREATE TABLE evals.outbox_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, step_id uuid NOT NULL,
 queue text NOT NULL CHECK(queue IN ('ingest','profile','generate','validate','execute_api','execute_browser','grade','aggregate','report','export','notify','cleanup')),
 available_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(org_id,step_id) REFERENCES evals.workflow_step(org_id,id)
);
CREATE TABLE evals.execution_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id uuid NOT NULL, workflow_id uuid NOT NULL,
 kind text NOT NULL, reason_code text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,workflow_id) REFERENCES evals.execution_workflow(org_id,id)
);
CREATE INDEX execution_outbox_pending ON evals.outbox_event(org_id,available_at,id) WHERE delivered_at IS NULL;
CREATE INDEX execution_step_recovery ON evals.workflow_step(org_id,lease_until) WHERE status='running';
CREATE INDEX execution_attempt_capacity ON evals.execution_attempt(provider_revision_id,status,created_at);
CREATE INDEX execution_event_cursor ON evals.execution_event(org_id,workflow_id,id);
CREATE FUNCTION evals.execution_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable execution record'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['provider_revision','price_revision','secret_version','execution_result','execution_cost_entry','execution_event'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_execution BEFORE UPDATE OR DELETE ON evals.%I FOR EACH ROW EXECUTE FUNCTION evals.execution_immutable()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['secret_record','secret_version','execution_budget','execution_workflow','workflow_step','execution_attempt','budget_reservation','execution_result','execution_cost_entry','outbox_event','execution_event'] LOOP
 EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY execution_tenant ON evals.%I USING (org_id = nullif(current_setting(''evals.org_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''evals.org_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
-- Global capacity/rate accounting cannot use tenant-filtered attempts. It contains IDs only.
CREATE TABLE evals.provider_slot (
 attempt_id uuid PRIMARY KEY, provider_revision_id uuid NOT NULL REFERENCES evals.provider_revision,
 token_bound integer NOT NULL, acquired_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz
);
CREATE INDEX provider_slot_rate ON evals.provider_slot(provider_revision_id,acquired_at);
CREATE INDEX provider_slot_active ON evals.provider_slot(provider_revision_id) WHERE released_at IS NULL;
-- Grant explicitly to separately provisioned admin/worker roles; never blanket-grant registry or secrets to the web role.
REVOKE ALL ON evals.provider_account,evals.provider_revision,evals.provider_health,evals.price_revision,evals.provider_slot,evals.secret_record,evals.secret_version FROM PUBLIC;
CREATE FUNCTION evals.execution_frozen_plan() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='execution_workflow' THEN
  IF (NEW.org_id,NEW.run_id,NEW.plan_hash,NEW.created_by) IS DISTINCT FROM (OLD.org_id,OLD.run_id,OLD.plan_hash,OLD.created_by) THEN RAISE EXCEPTION 'immutable execution plan'; END IF;
 ELSIF TG_TABLE_NAME='workflow_step' THEN
  IF (NEW.org_id,NEW.workflow_id,NEW.step_kind,NEW.input_hash,NEW.version,NEW.input) IS DISTINCT FROM (OLD.org_id,OLD.workflow_id,OLD.step_kind,OLD.input_hash,OLD.version,OLD.input) THEN RAISE EXCEPTION 'immutable execution input'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER execution_plan_frozen BEFORE UPDATE ON evals.execution_workflow FOR EACH ROW EXECUTE FUNCTION evals.execution_frozen_plan();
CREATE TRIGGER execution_input_frozen BEFORE UPDATE ON evals.workflow_step FOR EACH ROW EXECUTE FUNCTION evals.execution_frozen_plan();
COMMIT;
