-- Reverts 093 only while nothing depends on it: no workspace on payg or
-- partner, no member cap and no workspace override. Once a workspace has
-- been upgraded (it paid) or an admin has set an override (audited), switch
-- PLANS_V2_ENABLED off and repair forward instead. Allowance entries stay in
-- the ledger either way: the ledger is append-only.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM evals.workspace_entitlement WHERE plan IN ('payg','partner') OR max_members IS NOT NULL)
     OR (to_regclass('billing.workspace_override') IS NOT NULL AND EXISTS (SELECT 1 FROM billing.workspace_override)) THEN
    RAISE EXCEPTION 'plans v2 rollback refused: a workspace is on payg or partner, has a member cap, or has an override; repair forward';
  END IF;
END $$;

DROP TRIGGER IF EXISTS enforce_plan_members ON evals.invitation;
DROP FUNCTION IF EXISTS
  evals.enforce_plan_members(),
  evals.upgrade_plan_on_purchase(uuid, uuid),
  evals.plan_usage(uuid),
  billing.set_workspace_override(uuid, text, boolean, boolean, text, text),
  billing.list_workspace_overrides(),
  billing.live_payments_allowed(uuid[]),
  billing.allowance_due(text, boolean, integer);
DROP TABLE IF EXISTS billing.workspace_override;

ALTER TABLE evals.workspace_entitlement DROP COLUMN IF EXISTS max_members;
ALTER TABLE evals.workspace_entitlement DROP CONSTRAINT workspace_entitlement_plan_check;
ALTER TABLE evals.workspace_entitlement ADD CONSTRAINT workspace_entitlement_plan_check CHECK (plan IN ('managed','free'));

-- The 075 trigger bodies.
CREATE OR REPLACE FUNCTION evals.enforce_plan_systems() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_systems INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NOT NULL AND (SELECT count(*) FROM evals.target t WHERE t.org_id = NEW.org_id AND t.archived_at IS NULL) >= cap THEN
    RAISE EXCEPTION 'PLAN_LIMIT_SYSTEMS';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION evals.enforce_plan_runs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_runs_per_month INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NOT NULL AND (SELECT count(*) FROM evals.run r WHERE r.org_id = NEW.org_id
      AND r.created_at >= date_trunc('month', now())) >= cap THEN
    RAISE EXCEPTION 'PLAN_LIMIT_RUNS';
  END IF;
  RETURN NEW;
END $$;

DELETE FROM public.evals_migration_history WHERE name = '093_evals_plans_v2.sql';
COMMIT;
