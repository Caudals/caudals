-- Integrations v2 (launch spec v2 P-25, P-27, P-28, package L-19): a CI
-- trigger, a release gate and Slack, Microsoft Teams and email destinations.
--
--   customer_api_token   a fourth scope, `runs:write`: start a run of an
--                        approved test set from a pipeline. Tokens that carry
--                        it are short-lived (at most 90 days; the app offers
--                        1 to 90, the database allows a day of slack).
--   api_run_request      one row per run started through the API: the
--                        workspace's Idempotency-Key (unique per workspace, so
--                        each key starts exactly one run), the request's hash
--                        and the token that started it (provenance). Written
--                        in the run's own transaction; immutable.
--   webhook_endpoint     a destination type: `webhook` (the signed generic
--                        webhook, unchanged), `slack`, `teams` or `email`.
--                        For the three new types the incoming-webhook URL or
--                        the address is the credential: it is kept only in the
--                        endpoint's encrypted envelope
--                        (webhook_secret_version), `url` stays NULL and
--                        `target_hint` holds a masked hint for the list. Each
--                        destination has a message language, the result of
--                        its last test send, and `archived_at` (deleted from
--                        Settings; never re-enabled, deliveries stop).
--   suite, monitor_schedule
--                        `gate_threshold`: the pass rate (0–100 %) the release
--                        gate requires of a run of this test set, or of this
--                        schedule's runs (the schedule's wins). Changing it
--                        does not change a schedule's version.
--   workspace_member_emails(org)
--                        verified members' addresses, for the rule that an
--                        email destination is a member's address or on a
--                        member's company domain (SECURITY DEFINER, the
--                        workspace of the transaction only).
--
-- Additive. The rollback refuses while any of it holds data.
BEGIN;

/* ------------------------------------------------ token scope runs:write --- */

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'evals.customer_api_token'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%schedules:read%';
  IF c IS NULL THEN RAISE EXCEPTION 'customer_api_token scope check not found'; END IF;
  EXECUTE format('ALTER TABLE evals.customer_api_token DROP CONSTRAINT %I', c);
END $$;
ALTER TABLE evals.customer_api_token ADD CONSTRAINT customer_api_token_scopes_check
  CHECK (scopes <@ ARRAY['runs:read','reports:read','schedules:read','runs:write']::text[] AND cardinality(scopes) > 0);
ALTER TABLE evals.customer_api_token ADD CONSTRAINT customer_api_token_write_expiry
  CHECK (NOT ('runs:write' = ANY (scopes)) OR expires_at <= created_at + interval '91 days');

/* ------------------------------------------------------ API-started runs --- */

CREATE TABLE evals.api_run_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  idempotency_key text NOT NULL CONSTRAINT api_run_request_key CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash text NOT NULL CONSTRAINT api_run_request_hash CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  token_id uuid NOT NULL,
  run_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (org_id, run_id),
  FOREIGN KEY (org_id, token_id) REFERENCES evals.customer_api_token(org_id, id),
  FOREIGN KEY (org_id, run_id) REFERENCES evals.run(org_id, id)
);
CREATE INDEX api_run_request_recent ON evals.api_run_request(org_id, created_at);
ALTER TABLE evals.api_run_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.api_run_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON evals.api_run_request
  USING (org_id = nullif(current_setting('evals.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('evals.org_id', true), '')::uuid);
REVOKE ALL ON evals.api_run_request FROM PUBLIC;
GRANT SELECT, INSERT ON evals.api_run_request TO evals_runtime;
CREATE TRIGGER api_run_request_immutable BEFORE UPDATE OR DELETE ON evals.api_run_request
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();

/* --------------------------------------------------- destination types --- */

ALTER TABLE evals.webhook_endpoint
  ADD COLUMN destination_type text NOT NULL DEFAULT 'webhook'
    CONSTRAINT webhook_endpoint_destination_type CHECK (destination_type IN ('webhook', 'slack', 'teams', 'email')),
  ADD COLUMN target_hint text
    CONSTRAINT webhook_endpoint_target_hint CHECK (target_hint IS NULL OR length(target_hint) BETWEEN 1 AND 200),
  ADD COLUMN locale text NOT NULL DEFAULT 'en'
    CONSTRAINT webhook_endpoint_locale CHECK (locale IN ('en', 'es')),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN last_test_at timestamptz,
  ADD COLUMN last_test_status text
    CONSTRAINT webhook_endpoint_last_test_status CHECK (last_test_status IS NULL OR last_test_status IN ('delivered', 'failed')),
  ADD COLUMN last_test_reason text
    CONSTRAINT webhook_endpoint_last_test_reason CHECK (last_test_reason IS NULL OR last_test_reason ~ '^[a-z_]{1,40}$'),
  ADD COLUMN last_test_http_status integer;
ALTER TABLE evals.webhook_endpoint ALTER COLUMN url DROP NOT NULL;
-- The generic webhook keeps its URL in the clear (as before); the other types keep it, or the address, encrypted only.
ALTER TABLE evals.webhook_endpoint ADD CONSTRAINT webhook_endpoint_url_by_type
  CHECK ((destination_type = 'webhook') = (url IS NOT NULL));
ALTER TABLE evals.webhook_endpoint ADD CONSTRAINT webhook_endpoint_hint_by_type
  CHECK (destination_type = 'webhook' OR target_hint IS NOT NULL);
-- A deleted destination never sends again.
ALTER TABLE evals.webhook_endpoint ADD CONSTRAINT webhook_endpoint_archived_disabled
  CHECK (archived_at IS NULL OR NOT enabled);
CREATE INDEX webhook_endpoint_live ON evals.webhook_endpoint(org_id, destination_type) WHERE archived_at IS NULL;
GRANT UPDATE (archived_at, last_test_at, last_test_status, last_test_reason, last_test_http_status) ON evals.webhook_endpoint TO evals_runtime;

/* ------------------------------------------------------- gate thresholds --- */

ALTER TABLE evals.suite ADD COLUMN gate_threshold numeric(5,2)
  CONSTRAINT suite_gate_threshold CHECK (gate_threshold IS NULL OR gate_threshold BETWEEN 0 AND 100);
GRANT UPDATE (gate_threshold) ON evals.suite TO evals_runtime;
ALTER TABLE evals.monitor_schedule ADD COLUMN gate_threshold numeric(5,2)
  CONSTRAINT monitor_schedule_gate_threshold CHECK (gate_threshold IS NULL OR gate_threshold BETWEEN 0 AND 100);
GRANT UPDATE (gate_threshold) ON evals.monitor_schedule TO evals_runtime;

/* ------------------------------------------------ email destination rule --- */

CREATE FUNCTION evals.workspace_member_emails(p_org_id uuid)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, public AS $$
  SELECT DISTINCT lower(u.email)
  FROM evals.membership m
  JOIN public.auth_user u ON u.id = m.user_id AND u."emailVerified"
  WHERE m.org_id = p_org_id AND p_org_id = evals.org_id()
$$;
REVOKE ALL ON FUNCTION evals.workspace_member_emails(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.workspace_member_emails(uuid) TO evals_runtime;

COMMIT;
