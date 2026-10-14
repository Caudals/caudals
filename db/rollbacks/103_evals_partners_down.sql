-- Reverts 103 only while no partner was ever created. Once a partner exists
-- (its links, codes, referrals, allowance grants and audited memberships are
-- evidence), switch PARTNERS_ENABLED off and repair forward instead.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM evals.partner) OR EXISTS (SELECT 1 FROM evals.membership WHERE partner_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM evals.export_job WHERE brand IS NOT NULL) THEN
    RAISE EXCEPTION 'partners rollback refused: a partner, a partner membership or a branded export exists; repair forward';
  END IF;
END $$;

DROP TRIGGER IF EXISTS partner_attribution ON evals.workspace;
DROP TRIGGER IF EXISTS partner_first_payment ON billing.top_up_order;

DROP FUNCTION IF EXISTS
  evals.partner_create(text, integer, text, integer, text),
  evals.partner_update(uuid, text, integer, text, integer, text),
  evals.partner_add_member(uuid, text, text, text),
  evals.partner_remove_member(uuid, text, text),
  evals.partner_create_client(uuid, text, text),
  evals.partner_link_client(uuid, uuid, text, text),
  evals.partner_unlink_client(uuid, uuid, text),
  evals.partner_create_code(uuid, text),
  evals.partner_revoke_code(uuid, uuid, text),
  evals._partner_workspace_touch(),
  evals._partner_first_payment(),
  evals._partner_attribute(uuid, jsonb, text),
  evals.partner_set_logo(uuid, text, text, integer, text),
  evals.partner_pdf_brand(uuid),
  evals.partner_pdf_logo(uuid, uuid, text),
  evals.partner_set_allowance(uuid, bigint, date, date, text),
  evals.partner_grant_allowance(uuid, uuid, bigint, text, text, timestamptz),
  evals.partner_access(uuid, text),
  evals.partner_members(uuid),
  evals.partner_clients(uuid),
  evals.partner_referrals(uuid, boolean),
  evals.partner_statement(uuid, date, boolean),
  evals._partner_sync(uuid),
  evals._partner_orphans(uuid, uuid),
  evals._partner_desired(uuid),
  evals._partner_require(uuid, text),
  evals._partner_admin(),
  evals._partner_reason(text),
  evals._partner_audit(uuid, text, text, jsonb);

ALTER TABLE evals.export_job DROP CONSTRAINT IF EXISTS export_job_brand;
ALTER TABLE evals.export_job DROP COLUMN IF EXISTS brand;
DROP INDEX IF EXISTS evals.membership_partner;
ALTER TABLE evals.membership DROP COLUMN IF EXISTS partner_id;

DROP TABLE IF EXISTS evals.partner_allowance_grant, evals.partner_allowance, evals.partner_referral,
  evals.partner_referral_code, evals.partner_client, evals.partner_member;
DROP FUNCTION IF EXISTS evals.partner_role(uuid) CASCADE;
DROP TABLE IF EXISTS evals.partner;

-- The 093 bodies.
CREATE OR REPLACE FUNCTION evals.enforce_plan_members() RETURNS trigger
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

CREATE OR REPLACE FUNCTION evals.plan_usage(p_org_id uuid)
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

DELETE FROM public.evals_migration_history WHERE name = '103_evals_partners.sql';
COMMIT;
