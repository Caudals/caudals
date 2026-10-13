-- Plans v2: free → pay as you go → managed (launch spec v2 §6.5, §6.10,
-- §6.15, §6.18; P-09; package L-14).
--
--   workspace_entitlement.plan  gains 'payg' (any workspace that has bought
--                       credits) and 'partner' (per agreement, L-28). The
--                       billing account follows the plan through the 084
--                       trigger: payg and partner are 'credits' accounts.
--   max_members         a member cap (owners, editors and viewers; Caudals
--                       operators never count), checked when an invitation
--                       is created. NULL = no cap, as for every plan today.
--   plan triggers       the 075 system and monthly-run caps now serialise
--                       capped inserts per workspace (two at once cannot both
--                       pass) and say which workspace and cap in the error
--                       DETAIL, so the API can answer with a typed
--                       PLAN_LIMIT_* error. Uncapped (managed) workspaces take
--                       the same path as before: no lock, no change.
--   upgrade_plan_on_purchase  free → payg in the transaction that records a
--                       paid top-up (lib/billing/settlement.ts), with the PAYG
--                       limits of §6.5: 10 systems, 500 questions per set, no
--                       monthly run cap (credits and caps limit runs), 2
--                       active runs, schedules, uploads, 10 members. A limit
--                       an operator had already raised is never lowered.
--   allowance_due       free and payg workspaces still without this month's
--                       1,000-credit allowance (granted by the scheduler,
--                       lib/billing/allowance.ts, with billing.grant).
--   workspace_override  per-workspace rollout controls, set only by platform
--                       admins (audited, reason required; decision I-11 and
--                       the L-12 founder note): credit enforcement
--                       (inherit | shadow | enforce), live-mode top-ups before
--                       Gate B, and plans v2 for this workspace before
--                       PLANS_V2_ENABLED. The engine and the top-up routes
--                       read it.
--   plan_usage          what the plan summary API shows as used.
--
-- Forward repair: additive. The rollback refuses once a workspace is on payg
-- or partner, has a member cap, or any override exists.
BEGIN;

/* -------------------------------------------------------------- plans --- */

ALTER TABLE evals.workspace_entitlement DROP CONSTRAINT workspace_entitlement_plan_check;
ALTER TABLE evals.workspace_entitlement ADD CONSTRAINT workspace_entitlement_plan_check
  CHECK (plan IN ('managed','free','payg','partner'));
ALTER TABLE evals.workspace_entitlement
  ADD COLUMN max_members integer CHECK (max_members IS NULL OR max_members >= 1);

/* ----------------------------------------------------------- triggers --- */

-- Systems (075), now serialised per capped workspace and typed in DETAIL.
CREATE OR REPLACE FUNCTION evals.enforce_plan_systems() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_systems INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NULL THEN RETURN NEW; END IF;
  SELECT max_systems INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id FOR NO KEY UPDATE;
  IF cap IS NOT NULL AND (SELECT count(*) FROM evals.target t WHERE t.org_id = NEW.org_id AND t.archived_at IS NULL) >= cap THEN
    RAISE EXCEPTION 'PLAN_LIMIT_SYSTEMS' USING DETAIL = json_build_object('org_id', NEW.org_id, 'limit', cap)::text;
  END IF;
  RETURN NEW;
END $$;

-- Runs this calendar month (075), the same way.
CREATE OR REPLACE FUNCTION evals.enforce_plan_runs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_runs_per_month INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NULL THEN RETURN NEW; END IF;
  SELECT max_runs_per_month INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id FOR NO KEY UPDATE;
  IF cap IS NOT NULL AND (SELECT count(*) FROM evals.run r WHERE r.org_id = NEW.org_id
      AND r.created_at >= date_trunc('month', now())) >= cap THEN
    RAISE EXCEPTION 'PLAN_LIMIT_RUNS' USING DETAIL = json_build_object('org_id', NEW.org_id, 'limit', cap)::text;
  END IF;
  RETURN NEW;
END $$;

-- Members: owners, editors and viewers plus live invitations. Checked when an
-- invitation is created, so an accepted invitation never fails on the cap.
CREATE FUNCTION evals.enforce_plan_members() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_members INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NULL THEN RETURN NEW; END IF;
  SELECT max_members INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id FOR NO KEY UPDATE;
  IF cap IS NOT NULL AND
     (SELECT count(*) FROM evals.membership m WHERE m.org_id = NEW.org_id AND m.role <> 'operator')
     + (SELECT count(*) FROM evals.invitation i WHERE i.org_id = NEW.org_id AND i.accepted_at IS NULL
          AND i.revoked_at IS NULL AND i.expires_at > now()) >= cap THEN
    RAISE EXCEPTION 'PLAN_LIMIT_MEMBERS' USING DETAIL = json_build_object('org_id', NEW.org_id, 'limit', cap)::text;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_plan_members BEFORE INSERT ON evals.invitation
  FOR EACH ROW EXECUTE FUNCTION evals.enforce_plan_members();
REVOKE ALL ON FUNCTION evals.enforce_plan_members() FROM PUBLIC;

/* ------------------------------------------------- free → pay as you go --- */

-- Called by the payment path (webhook, return-page sync, auto-recharge) in the
-- transaction that recorded the paid order, after billing.record_purchase:
-- the account lock is already held, so the plan change, the billing mode
-- (084 trigger) and the purchase commit together or not at all. Returns
-- whether the workspace moved from free to payg; any other plan is unchanged.
CREATE FUNCTION evals.upgrade_plan_on_purchase(p_org_id uuid, p_order_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE e evals.workspace_entitlement; n evals.workspace_entitlement; actor text;
BEGIN
  PERFORM billing._tenant(p_org_id);
  PERFORM billing._privileged();
  actor := billing._actor();
  IF NOT EXISTS (SELECT 1 FROM billing.top_up_order o WHERE o.org_id = p_org_id AND o.id = p_order_id AND o.paid_at IS NOT NULL) THEN
    RAISE EXCEPTION 'ORDER_NOT_PAID';
  END IF;
  SELECT * INTO e FROM evals.workspace_entitlement WHERE org_id = p_org_id FOR UPDATE;
  IF NOT FOUND OR e.plan <> 'free' THEN RETURN false; END IF;
  UPDATE evals.workspace_entitlement SET plan = 'payg',
    max_systems = CASE WHEN e.max_systems IS NULL THEN NULL ELSE greatest(e.max_systems, 10) END,
    max_tests_per_set = CASE WHEN e.max_tests_per_set IS NULL THEN NULL ELSE greatest(e.max_tests_per_set, 500) END,
    max_runs_per_month = NULL,
    max_active_runs = greatest(e.max_active_runs, 2),
    max_members = greatest(coalesce(e.max_members, 0), 10),
    can_schedule = true, can_export = true,
    allowed_connection_types = ARRAY(SELECT DISTINCT x FROM unnest(e.allowed_connection_types
      || ARRAY['website','openai_compatible','https_json','imported_responses']::text[]) AS x ORDER BY x),
    version = e.version + 1, updated_by = actor, updated_at = now()
  WHERE org_id = p_org_id RETURNING * INTO n;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, 'workspace.plan_upgraded', p_org_id::text, jsonb_build_object('order_id', p_order_id,
    'before', jsonb_build_object('plan', e.plan, 'max_systems', e.max_systems, 'max_tests_per_set', e.max_tests_per_set,
      'max_runs_per_month', e.max_runs_per_month, 'max_active_runs', e.max_active_runs, 'max_members', e.max_members,
      'can_schedule', e.can_schedule, 'allowed_connection_types', e.allowed_connection_types),
    'after', jsonb_build_object('plan', n.plan, 'max_systems', n.max_systems, 'max_tests_per_set', n.max_tests_per_set,
      'max_runs_per_month', n.max_runs_per_month, 'max_active_runs', n.max_active_runs, 'max_members', n.max_members,
      'can_schedule', n.can_schedule, 'allowed_connection_types', n.allowed_connection_types)));
  RETURN true;
END $$;

/* ----------------------------------------------------- rollout controls --- */

CREATE TABLE billing.workspace_override (
  org_id uuid PRIMARY KEY REFERENCES evals.workspace(id),
  -- Credit enforcement for this workspace: inherit follows BILLING_ENFORCE.
  enforcement text NOT NULL DEFAULT 'inherit' CHECK (enforcement IN ('inherit','shadow','enforce')),
  -- Live-mode top-ups before Gate B (the founder's purchase, design partners).
  live_payments boolean NOT NULL DEFAULT false,
  -- Plans v2 for this workspace before PLANS_V2_ENABLED: typed limits and
  -- dialogs, the monthly allowance and the upgrade on purchase.
  plans_v2 boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing.workspace_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.workspace_override FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON billing.workspace_override FOR SELECT
  USING (org_id = nullif(current_setting('evals.org_id', true), '')::uuid);
REVOKE ALL ON billing.workspace_override FROM PUBLIC;
-- The web runtime (and scheduler) and every worker read their own workspace's
-- row on the credit path; nobody writes it except the function below.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_runtime','evals_worker','evals_browser','evals_document'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON billing.workspace_override TO %I', r);
    END IF;
  END LOOP;
END $$;

-- Platform admins only, reason required, audited with before and after.
-- Enforcement cannot change while a run is in flight (queued, running,
-- pausing or cancelling): a run admitted in one mode finishes in that mode,
-- so the shadow report never sees half a run.
CREATE FUNCTION billing.set_workspace_override(p_org_id uuid, p_enforcement text, p_live_payments boolean,
  p_plans_v2 boolean, p_reason text, p_request_id text DEFAULT NULL)
RETURNS billing.workspace_override
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE b billing.workspace_override; r billing.workspace_override; v_reason text; actor text;
BEGIN
  PERFORM billing._tenant(p_org_id);
  IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  actor := billing._actor();
  IF p_enforcement IS NULL OR p_enforcement NOT IN ('inherit','shadow','enforce') OR p_live_payments IS NULL OR p_plans_v2 IS NULL
     OR (p_request_id IS NOT NULL AND length(p_request_id) > 200) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  v_reason := billing._reason(p_reason, true);
  IF NOT EXISTS (SELECT 1 FROM evals.workspace w WHERE w.id = p_org_id AND w.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  -- One change at a time per workspace, also for the first row.
  PERFORM pg_advisory_xact_lock(hashtextextended('billing-override:' || p_org_id::text, 0));
  SELECT * INTO b FROM billing.workspace_override WHERE org_id = p_org_id FOR UPDATE;
  IF coalesce(b.enforcement, 'inherit') <> p_enforcement AND EXISTS (SELECT 1 FROM evals.run x WHERE x.org_id = p_org_id
      AND x.status IN ('queued','running','pause_requested','cancel_requested')) THEN
    RAISE EXCEPTION 'WORKSPACE_BUSY';
  END IF;
  INSERT INTO billing.workspace_override AS o (org_id, enforcement, live_payments, plans_v2, reason, updated_by)
  VALUES (p_org_id, p_enforcement, p_live_payments, p_plans_v2, v_reason, actor)
  ON CONFLICT (org_id) DO UPDATE SET enforcement = EXCLUDED.enforcement, live_payments = EXCLUDED.live_payments,
    plans_v2 = EXCLUDED.plans_v2, reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by,
    version = o.version + 1, updated_at = now()
  RETURNING * INTO r;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org_id, actor, 'billing.workspace_override', p_org_id::text, jsonb_build_object('reason', v_reason, 'request_id', p_request_id,
    'before', CASE WHEN b.org_id IS NULL THEN NULL ELSE jsonb_build_object('enforcement', b.enforcement, 'live_payments', b.live_payments, 'plans_v2', b.plans_v2) END,
    'after', jsonb_build_object('enforcement', r.enforcement, 'live_payments', r.live_payments, 'plans_v2', r.plans_v2)));
  RETURN r;
END $$;

-- Every override, for platform admins (the API; L-16 builds the screen).
CREATE FUNCTION billing.list_workspace_overrides()
RETURNS TABLE (org_id uuid, workspace text, plan text, billing_mode text, enforcement text, live_payments boolean, plans_v2 boolean,
  reason text, version integer, updated_by text, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT o.org_id, w.name, e.plan, a.billing_mode, o.enforcement, o.live_payments, o.plans_v2, o.reason, o.version,
      o.updated_by, o.updated_at
    FROM billing.workspace_override o JOIN evals.workspace w ON w.id = o.org_id AND w.deleted_at IS NULL
    LEFT JOIN evals.workspace_entitlement e ON e.org_id = o.org_id LEFT JOIN billing.credit_account a ON a.org_id = o.org_id
    ORDER BY o.updated_at DESC, o.org_id LIMIT 500;
END $$;

-- Which of these workspaces may top up in live mode before Gate B. Only
-- ids are returned; pages check every workspace a person owns at once and
-- the scheduler checks auto-recharge candidates.
CREATE FUNCTION billing.live_payments_allowed(p_org_ids uuid[]) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT o.org_id FROM billing.workspace_override o JOIN evals.workspace w ON w.id = o.org_id AND w.deleted_at IS NULL
  WHERE o.live_payments AND o.org_id = ANY (p_org_ids[1:500])
$$;

/* -------------------------------------------------- monthly allowance --- */

-- Free and payg workspaces without this month's allowance entry (key
-- grant:allowance:<YYYY-MM>, unique per workspace in the ledger). p_all is
-- PLANS_V2_ENABLED; otherwise only workspaces with the plans_v2 override.
-- Frozen accounts and deleted workspaces get nothing.
CREATE FUNCTION billing.allowance_due(p_period text, p_all boolean, p_limit integer DEFAULT 200) RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM billing._privileged();
  IF p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR p_all IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  RETURN QUERY
  SELECT e.org_id FROM evals.workspace_entitlement e
  JOIN evals.workspace w ON w.id = e.org_id AND w.deleted_at IS NULL
  JOIN billing.credit_account a ON a.org_id = e.org_id AND a.frozen_reason IS NULL
  LEFT JOIN billing.workspace_override o ON o.org_id = e.org_id
  WHERE e.plan IN ('free','payg') AND (p_all OR coalesce(o.plans_v2, false))
    AND NOT EXISTS (SELECT 1 FROM billing.ledger_entry l WHERE l.org_id = e.org_id AND l.idempotency_key = 'grant:allowance:' || p_period)
  ORDER BY w.created_at, e.org_id
  LIMIT greatest(1, least(coalesce(p_limit, 200), 1000));
END $$;

/* --------------------------------------------------------- plan usage --- */

-- What counts against the plan, for the plan summary API: members need this
-- function because membership rows are visible only to their own person.
CREATE FUNCTION evals.plan_usage(p_org_id uuid)
RETURNS TABLE (systems integer, runs_this_month integer, active_runs integer, members integer, pending_invitations integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF p_org_id IS NULL OR p_org_id IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF NOT evals.is_admin() AND NOT EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id = p_org_id AND m.user_id = evals.actor_id()) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
    (SELECT count(*)::integer FROM evals.target t WHERE t.org_id = p_org_id AND t.archived_at IS NULL),
    (SELECT count(*)::integer FROM evals.run r WHERE r.org_id = p_org_id AND r.created_at >= date_trunc('month', now())),
    (SELECT count(*)::integer FROM evals.run r WHERE r.org_id = p_org_id AND r.status IN ('queued','running','pause_requested','cancel_requested')),
    (SELECT count(*)::integer FROM evals.membership m WHERE m.org_id = p_org_id AND m.role <> 'operator'),
    (SELECT count(*)::integer FROM evals.invitation i WHERE i.org_id = p_org_id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now());
END $$;

/* ------------------------------------------------------------- grants --- */

REVOKE ALL ON FUNCTION evals.upgrade_plan_on_purchase(uuid, uuid), evals.plan_usage(uuid),
  billing.set_workspace_override(uuid, text, boolean, boolean, text, text), billing.list_workspace_overrides(),
  billing.live_payments_allowed(uuid[]), billing.allowance_due(text, boolean, integer) FROM PUBLIC;
-- The web runtime and, as a member of it, the scheduler. Workers get none.
GRANT EXECUTE ON FUNCTION evals.upgrade_plan_on_purchase(uuid, uuid), evals.plan_usage(uuid),
  billing.set_workspace_override(uuid, text, boolean, boolean, text, text), billing.list_workspace_overrides(),
  billing.live_payments_allowed(uuid[]), billing.allowance_due(text, boolean, integer) TO evals_runtime;

COMMIT;
