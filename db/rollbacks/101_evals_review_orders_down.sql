-- Rollback for db/migrations/101_evals_review_orders.sql.
--
-- Refuses while any review request, CRM draft, order, order assignment or
-- expert onboarding checklist exists: they are customer requests, the
-- provenance of reviewed report revisions (decision I-7) and the record of
-- who was vetted and contracted. Switch EXPERT_REVIEW_ORDERS_ENABLED off,
-- redeploy a compatible image and repair forward instead. It must run as a
-- role that bypasses row-level security, or the counts below could not see
-- every row. One transaction, so the guard holds even when psql runs without
-- ON_ERROR_STOP.
BEGIN;

DO $$
DECLARE
  bypasses boolean;
  remaining bigint := 0;
  counted bigint;
  name text;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypasses FROM pg_roles r WHERE r.rolname = current_user;
  IF NOT coalesce(bypasses, false) THEN
    RAISE EXCEPTION 'Rollback blocked: run it as a role that bypasses row-level security.';
  END IF;
  -- Dynamic SQL: a static reference would fail to plan once a table is gone.
  FOREACH name IN ARRAY ARRAY['evals.review_request', 'evals.review_crm_draft', 'evals.review_order',
    'evals.review_order_assignment', 'evals.expert_onboarding'] LOOP
    IF to_regclass(name) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %s', name) INTO counted;
      remaining := remaining + counted;
    END IF;
  END LOOP;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Rollback blocked: % expert review rows exist. Repair forward instead.', remaining;
  END IF;
END $$;

DROP TRIGGER IF EXISTS report_revision_expert_review_guard ON evals.report_revision;
DROP FUNCTION IF EXISTS evals.save_expert_onboarding(uuid, jsonb);
DROP FUNCTION IF EXISTS evals.cancel_review_order(uuid, text);
DROP FUNCTION IF EXISTS evals.complete_review_order(uuid, uuid);
DROP FUNCTION IF EXISTS evals.review_order_progress(uuid);
DROP FUNCTION IF EXISTS evals.link_review_order_assignment(uuid, uuid);
DROP FUNCTION IF EXISTS evals.create_review_order(uuid, text, text, timestamptz, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS evals.update_review_request(uuid, text, text);
DROP FUNCTION IF EXISTS evals.mark_review_request_notified(uuid, uuid);
DROP FUNCTION IF EXISTS evals.request_expert_review(uuid, uuid, text, text, text, date, text, text, jsonb);
DROP FUNCTION IF EXISTS evals.guard_expert_review_label();
DROP FUNCTION IF EXISTS evals.expert_ready(uuid);
DROP FUNCTION IF EXISTS evals.review_order_recorded_reviewers(uuid, uuid);
DROP FUNCTION IF EXISTS evals.next_working_day(timestamptz);
DROP TABLE IF EXISTS evals.expert_onboarding;
DROP TABLE IF EXISTS evals.review_order_assignment;
DROP TABLE IF EXISTS evals.review_order;
DROP TABLE IF EXISTS evals.review_crm_draft;
DROP TABLE IF EXISTS evals.review_request;
DELETE FROM public.evals_migration_history WHERE name = '101_evals_review_orders.sql';

COMMIT;
