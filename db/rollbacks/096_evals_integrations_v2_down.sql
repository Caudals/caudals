-- Rollback for db/migrations/096_evals_integrations_v2.sql.
--
-- Drops the API run requests, the destination type and its columns, the gate
-- thresholds and evals.workspace_member_emails, and restores the three-scope
-- token check. It refuses while any of it holds data: a run started through
-- the API, a `runs:write` token, a Slack/Teams/email destination or a deleted
-- one, or a threshold. Switch INTEGRATIONS_V2_ENABLED off and repair forward
-- instead. Run it as a role that bypasses row-level security, or the counts
-- could not see every row. One transaction.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  IF EXISTS (SELECT 1 FROM evals.api_run_request) THEN
    RAISE EXCEPTION 'Rollback blocked: runs were started through the API; repair forward instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM evals.customer_api_token WHERE 'runs:write' = ANY (scopes)) THEN
    RAISE EXCEPTION 'Rollback blocked: runs:write tokens exist; repair forward instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM evals.webhook_endpoint WHERE destination_type <> 'webhook' OR archived_at IS NOT NULL OR last_test_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback blocked: Slack, Teams, email or deleted destinations exist; repair forward instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM evals.suite WHERE gate_threshold IS NOT NULL)
    OR EXISTS (SELECT 1 FROM evals.monitor_schedule WHERE gate_threshold IS NOT NULL) THEN
    RAISE EXCEPTION 'Rollback blocked: gate thresholds are set; repair forward instead.';
  END IF;
END $$;

DROP FUNCTION evals.workspace_member_emails(uuid);

ALTER TABLE evals.monitor_schedule DROP COLUMN gate_threshold;
ALTER TABLE evals.suite DROP COLUMN gate_threshold;

DROP INDEX evals.webhook_endpoint_live;
ALTER TABLE evals.webhook_endpoint
  DROP CONSTRAINT webhook_endpoint_archived_disabled,
  DROP CONSTRAINT webhook_endpoint_hint_by_type,
  DROP CONSTRAINT webhook_endpoint_url_by_type;
ALTER TABLE evals.webhook_endpoint ALTER COLUMN url SET NOT NULL;
ALTER TABLE evals.webhook_endpoint
  DROP COLUMN last_test_http_status,
  DROP COLUMN last_test_reason,
  DROP COLUMN last_test_status,
  DROP COLUMN last_test_at,
  DROP COLUMN archived_at,
  DROP COLUMN locale,
  DROP COLUMN target_hint,
  DROP COLUMN destination_type;

DROP TABLE evals.api_run_request;

ALTER TABLE evals.customer_api_token
  DROP CONSTRAINT customer_api_token_write_expiry,
  DROP CONSTRAINT customer_api_token_scopes_check;
ALTER TABLE evals.customer_api_token ADD CONSTRAINT customer_api_token_scopes_check
  CHECK (scopes <@ ARRAY['runs:read','reports:read','schedules:read']::text[] AND cardinality(scopes) > 0);

DELETE FROM public.evals_migration_history WHERE name = '096_evals_integrations_v2.sql';

COMMIT;
