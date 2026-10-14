-- Partner workspaces and referral codes (launch L-28; spec v2 P-52, §6.5
-- "Partner", §6.15 credit moves, §6.17, §7.8).
--
-- A partner (an agency or integrator) is an account that manages several
-- client workspaces with the operator client model, scoped to the partner:
--
--   evals.partner                 the agreement: name, status (active |
--                                 suspended | closed), revenue share (20 % by
--                                 default, §7.8), client cap and an optional
--                                 white-label PDF logo (a private object in
--                                 the evaluation store, PNG or JPEG ≤ 512 KB).
--   evals.partner_member          people of the partner: admin | member. Ops
--                                 (platform admins) add and remove them.
--   evals.partner_client          partner ↔ client workspace links. A
--                                 workspace has at most one live link.
--                                 `created` clients were made by the partner
--                                 (access `manage`); ops may link an existing
--                                 workspace (`linked`, access `work` unless
--                                 ops choose `manage`).
--   evals.partner_referral_code   unique, revocable codes (`cp-` + 10 hex)
--                                 for `?partner=` / `?ref=` links.
--   evals.partner_referral        one referring partner per workspace, from
--                                 the first-touch attribution saved at sign-up
--                                 (L-02), with the workspace's first payment.
--   evals.partner_allowance       credits per Madrid month per agreement.
--   evals.partner_allowance_grant ops grants from that allowance into a
--                                 client workspace, each one a
--                                 billing.grant (source contract_allowance,
--                                 ref partner) in the ledger.
--
-- Access to client workspaces: partner members get ordinary membership rows
-- in the partner's live clients, marked with membership.partner_id and kept
-- in step by evals._partner_sync in the same transaction as every change
-- (member added or removed, client linked or unlinked, partner suspended or
-- closed). Partner admins are `owner` of the clients the partner manages and
-- everyone else is `editor`; partner people never get the workspace
-- `operator` role, so they never count as Caudals staff and have no
-- platform-operator power anywhere. A person who already has their own
-- membership in a workspace keeps it untouched. Every grant and revocation is
-- audited in the client workspace.
--
-- Reads: RLS lets partner members see their own partner's rows and platform
-- admins see all; members of a client workspace see that workspace's link.
-- Writes go only through the SECURITY DEFINER functions below, which check
-- the actor in the database (never a role passed in by the caller).
-- Attribution and first-payment triggers never fail a sign-up or a payment.
--
-- Also: partner memberships do not count against a client's member cap
-- (like Caudals operators; 093 functions updated), and PDF export jobs can
-- carry the partner brand (export_job.brand) that the documents worker
-- re-checks before it reads the logo.
--
-- Forward repair: additive. The rollback refuses once any partner exists.
BEGIN;

/* ------------------------------------------------------------- tables --- */

CREATE TABLE evals.partner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  -- Basis points of first-year referred revenue (§7.8: 20 %), or its credit equivalent.
  revenue_share_bps integer NOT NULL DEFAULT 2000 CHECK (revenue_share_bps BETWEEN 0 AND 10000),
  agreement_note text CHECK (agreement_note IS NULL OR length(agreement_note) <= 2000),
  max_clients integer NOT NULL DEFAULT 25 CHECK (max_clients BETWEEN 1 AND 500),
  logo_object_key text CHECK (logo_object_key IS NULL OR logo_object_key ~ '^evals/partners/[0-9a-f-]{36}/logo/[0-9a-f-]{36}$'),
  logo_sha256 text CHECK (logo_sha256 IS NULL OR logo_sha256 ~ '^[0-9a-f]{64}$'),
  logo_bytes integer CHECK (logo_bytes IS NULL OR logo_bytes BETWEEN 1 AND 524288),
  logo_media_type text CHECK (logo_media_type IS NULL OR logo_media_type IN ('image/png','image/jpeg')),
  logo_updated_at timestamptz,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK ((logo_object_key IS NULL) = (logo_sha256 IS NULL) AND (logo_sha256 IS NULL) = (logo_bytes IS NULL)
     AND (logo_bytes IS NULL) = (logo_media_type IS NULL)),
  CHECK (logo_object_key IS NULL OR logo_object_key LIKE 'evals/partners/' || id::text || '/logo/%')
);

CREATE TABLE evals.partner_member (
  partner_id uuid NOT NULL REFERENCES evals.partner(id),
  user_id text NOT NULL REFERENCES public.auth_user(id),
  role text NOT NULL CHECK (role IN ('admin','member')),
  added_by text NOT NULL CHECK (length(added_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, user_id)
);
CREATE INDEX partner_member_user ON evals.partner_member (user_id);

CREATE TABLE evals.partner_client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES evals.partner(id),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  access text NOT NULL CHECK (access IN ('manage','work')),
  origin text NOT NULL CHECK (origin IN ('created','linked')),
  request_key text CHECK (request_key IS NULL OR length(request_key) BETWEEN 8 AND 160),
  link_reason text CHECK (link_reason IS NULL OR length(link_reason) BETWEEN 3 AND 2000),
  linked_by text NOT NULL CHECK (length(linked_by) BETWEEN 1 AND 255),
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  unlinked_by text CHECK (unlinked_by IS NULL OR length(unlinked_by) BETWEEN 1 AND 255),
  unlink_reason text CHECK (unlink_reason IS NULL OR length(unlink_reason) BETWEEN 3 AND 2000),
  UNIQUE (partner_id, request_key),
  CHECK ((unlinked_at IS NULL) = (unlinked_by IS NULL)),
  CHECK (unlinked_at IS NULL OR unlinked_at >= linked_at)
);
CREATE UNIQUE INDEX partner_client_live ON evals.partner_client (org_id) WHERE unlinked_at IS NULL;
CREATE INDEX partner_client_partner ON evals.partner_client (partner_id, linked_at);

CREATE TABLE evals.partner_referral_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES evals.partner(id),
  code text NOT NULL UNIQUE CHECK (code ~ '^cp-[0-9a-f]{10}$'),
  label text CHECK (label IS NULL OR length(label) BETWEEN 1 AND 80),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text CHECK (revoke_reason IS NULL OR length(revoke_reason) BETWEEN 3 AND 2000),
  UNIQUE (partner_id, id),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE TABLE evals.partner_referral (
  org_id uuid PRIMARY KEY REFERENCES evals.workspace(id),
  partner_id uuid NOT NULL REFERENCES evals.partner(id),
  code_id uuid NOT NULL,
  -- Which first-touch label carried the code.
  matched_key text NOT NULL CHECK (matched_key IN ('partner','ref')),
  attributed_via text NOT NULL CHECK (attributed_via IN ('signup','payment')),
  attributed_at timestamptz NOT NULL DEFAULT now(),
  -- The workspace's first paid order (any Stripe mode), set by the payment trigger.
  first_order_id uuid,
  first_paid_at timestamptz,
  first_paid_net_cents bigint CHECK (first_paid_net_cents IS NULL OR first_paid_net_cents > 0),
  first_paid_livemode boolean,
  FOREIGN KEY (partner_id, code_id) REFERENCES evals.partner_referral_code(partner_id, id),
  CHECK ((first_order_id IS NULL) = (first_paid_at IS NULL) AND (first_paid_at IS NULL) = (first_paid_net_cents IS NULL)
     AND (first_paid_net_cents IS NULL) = (first_paid_livemode IS NULL))
);
CREATE INDEX partner_referral_partner ON evals.partner_referral (partner_id, attributed_at);

CREATE TABLE evals.partner_allowance (
  partner_id uuid PRIMARY KEY REFERENCES evals.partner(id),
  monthly_ucr bigint NOT NULL CHECK (monthly_ucr BETWEEN 0 AND 1000000000000000),
  valid_from date NOT NULL,
  valid_until date,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 2000),
  set_by text NOT NULL CHECK (length(set_by) BETWEEN 1 AND 255),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE evals.partner_allowance_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES evals.partner(id),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  -- Madrid calendar month the grant counts against.
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_ucr bigint NOT NULL CHECK (amount_ucr > 0),
  ledger_entry_id uuid NOT NULL,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 120),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 2000),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, request_key),
  FOREIGN KEY (org_id, ledger_entry_id) REFERENCES billing.ledger_entry(org_id, id)
);
CREATE INDEX partner_allowance_grant_period ON evals.partner_allowance_grant (partner_id, period);

-- Memberships granted through a partner (NULL for every other membership).
ALTER TABLE evals.membership ADD COLUMN partner_id uuid REFERENCES evals.partner(id);
CREATE INDEX membership_partner ON evals.membership (partner_id, org_id) WHERE partner_id IS NOT NULL;

-- The partner brand a workspace PDF is rendered with, chosen by the app when it
-- queues the job: the partner and the logo's hash, nothing else. The worker
-- re-checks the link and the hash before reading the logo.
ALTER TABLE evals.export_job ADD COLUMN brand jsonb;
ALTER TABLE evals.export_job ADD CONSTRAINT export_job_brand CHECK (
  brand IS NULL OR (
    kind = 'pdf' AND share_id IS NULL
    AND jsonb_typeof(brand) = 'object'
    AND (brand - 'partner_id' - 'logo_sha256') = '{}'::jsonb
    AND brand->>'partner_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND brand->>'logo_sha256' ~ '^[0-9a-f]{64}$'));

/* ------------------------------------------------------------- helpers --- */

-- The actor's role in an active partner: 'admin', 'member' or NULL.
CREATE FUNCTION evals.partner_role(p_partner uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT m.role FROM evals.partner_member m JOIN evals.partner p ON p.id = m.partner_id
  WHERE m.partner_id = p_partner AND m.user_id = evals.actor_id() AND p.status = 'active'
$$;

CREATE FUNCTION evals._partner_audit(p_org uuid, p_action text, p_subject text, p_details jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
  VALUES (p_org, coalesce(evals.actor_id(), 'system:partners'), p_action, p_subject, p_details)
$$;

CREATE FUNCTION evals._partner_reason(p_reason text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE r text := nullif(btrim(p_reason), '');
BEGIN
  IF r IS NULL OR length(r) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  RETURN r;
END $$;

-- Who may act on a partner: 'platform_admin', or the actor's partner role
-- ('admin' | 'member'). p_need 'admin' requires a partner admin (or a
-- platform admin). Raises SCOPE_DENIED otherwise, also for unknown partners.
CREATE FUNCTION evals._partner_require(p_partner uuid, p_need text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE r text;
BEGIN
  IF evals.actor_id() IS NULL OR p_partner IS NULL OR NOT EXISTS (SELECT 1 FROM evals.partner WHERE id = p_partner) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF evals.is_admin() THEN RETURN 'platform_admin'; END IF;
  r := evals.partner_role(p_partner);
  IF r IS NULL OR (p_need = 'admin' AND r <> 'admin') THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN r;
END $$;

CREATE FUNCTION evals._partner_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF evals.actor_id() IS NULL OR NOT evals.is_admin() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
END $$;

-- The memberships a partner's people should hold in its live clients.
CREATE FUNCTION evals._partner_desired(p_partner uuid)
RETURNS TABLE (org_id uuid, user_id text, role text)
LANGUAGE sql STABLE SET search_path = pg_catalog, evals AS $$
  SELECT c.org_id, m.user_id, CASE WHEN c.access = 'manage' AND m.role = 'admin' THEN 'owner' ELSE 'editor' END
  FROM evals.partner p
  JOIN evals.partner_client c ON c.partner_id = p.id AND c.unlinked_at IS NULL
  JOIN evals.partner_member m ON m.partner_id = p.id
  WHERE p.id = p_partner AND p.status = 'active'
$$;

-- Brings the partner-marked memberships in line with _partner_desired. Rows
-- of deleted workspaces are left as they are (the deletion workflow's
-- tombstone); a person's own membership is never touched.
CREATE FUNCTION evals._partner_sync(p_partner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE r record;
BEGIN
  FOR r IN DELETE FROM evals.membership ms USING evals.workspace w
      WHERE ms.partner_id = p_partner AND w.id = ms.org_id AND w.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM evals._partner_desired(p_partner) d WHERE d.org_id = ms.org_id AND d.user_id = ms.user_id)
      RETURNING ms.org_id, ms.user_id, ms.role
  LOOP
    PERFORM evals._partner_audit(r.org_id, 'membership.partner_revoked', r.user_id, jsonb_build_object('partner_id', p_partner, 'role', r.role));
  END LOOP;
  FOR r IN UPDATE evals.membership ms SET role = d.role FROM evals._partner_desired(p_partner) d
      WHERE ms.partner_id = p_partner AND ms.org_id = d.org_id AND ms.user_id = d.user_id AND ms.role <> d.role
      RETURNING ms.org_id, ms.user_id, ms.role
  LOOP
    PERFORM evals._partner_audit(r.org_id, 'membership.partner_role_changed', r.user_id, jsonb_build_object('partner_id', p_partner, 'role', r.role));
  END LOOP;
  FOR r IN INSERT INTO evals.membership AS ms (org_id, user_id, role, partner_id)
      SELECT d.org_id, d.user_id, d.role, p_partner FROM evals._partner_desired(p_partner) d
      JOIN evals.workspace w ON w.id = d.org_id AND w.deleted_at IS NULL
      ON CONFLICT (org_id, user_id) DO NOTHING
      RETURNING ms.org_id, ms.user_id, ms.role
  LOOP
    PERFORM evals._partner_audit(r.org_id, 'membership.partner_granted', r.user_id, jsonb_build_object('partner_id', p_partner, 'role', r.role));
  END LOOP;
END $$;

-- A live client the partner manages that would be left without an owner of
-- its own (the client's people) if the partner's people lost access.
CREATE FUNCTION evals._partner_orphans(p_partner uuid, p_org uuid DEFAULT NULL) RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog, evals AS $$
  SELECT count(*)::integer FROM evals.partner_client c JOIN evals.workspace w ON w.id = c.org_id AND w.deleted_at IS NULL
  WHERE c.partner_id = p_partner AND c.unlinked_at IS NULL AND c.access = 'manage' AND (p_org IS NULL OR c.org_id = p_org)
    AND NOT EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id = c.org_id AND m.role = 'owner' AND m.partner_id IS NULL)
$$;

/* ---------------------------------------------------- ops: the partner --- */

CREATE FUNCTION evals.partner_create(p_name text, p_revenue_share_bps integer, p_note text, p_max_clients integer, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE v_id uuid; v_reason text;
BEGIN
  PERFORM evals._partner_admin();
  v_reason := evals._partner_reason(p_reason);
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  INSERT INTO evals.partner AS x (name, revenue_share_bps, agreement_note, max_clients, created_by)
  VALUES (btrim(p_name), coalesce(p_revenue_share_bps, 2000), nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_max_clients, 25), evals.actor_id())
  RETURNING x.id INTO v_id;
  PERFORM evals._partner_audit(NULL, 'partner.created', v_id::text, jsonb_build_object('name', btrim(p_name),
    'revenue_share_bps', coalesce(p_revenue_share_bps, 2000), 'max_clients', coalesce(p_max_clients, 25), 'reason', v_reason));
  RETURN v_id;
END $$;

-- Status, share, note or client cap (NULL keeps a value; '' clears the note).
-- Closing is final: links end, codes are revoked, people are removed and
-- their client access goes; it is refused while a live client the partner
-- manages has no owner of its own (delete it or give it an owner first).
-- Returns the logo object key that was cleared on closing, for deletion.
CREATE FUNCTION evals.partner_update(p_partner uuid, p_status text, p_revenue_share_bps integer, p_note text,
  p_max_clients integer, p_reason text)
RETURNS TABLE (new_status text, new_version integer, cleared_logo_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE p evals.partner; n evals.partner; v_reason text; r record; v_logo text;
BEGIN
  PERFORM evals._partner_admin();
  v_reason := evals._partner_reason(p_reason);
  SELECT * INTO p FROM evals.partner WHERE id = p_partner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF p.status = 'closed' THEN RAISE EXCEPTION 'PARTNER_CLOSED'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('active','suspended','closed') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF p_status = 'closed' THEN
    IF evals._partner_orphans(p_partner) > 0 THEN RAISE EXCEPTION 'PARTNER_CLIENTS_ACTIVE'; END IF;
    UPDATE evals.partner_client c SET unlinked_at = now(), unlinked_by = evals.actor_id(), unlink_reason = v_reason
      WHERE c.partner_id = p_partner AND c.unlinked_at IS NULL;
    UPDATE evals.partner_referral_code c SET revoked_at = now(), revoked_by = evals.actor_id(), revoke_reason = v_reason
      WHERE c.partner_id = p_partner AND c.revoked_at IS NULL;
    FOR r IN DELETE FROM evals.partner_member m WHERE m.partner_id = p_partner RETURNING m.user_id, m.role LOOP
      PERFORM evals._partner_audit(NULL, 'partner.member_removed', p_partner::text, jsonb_build_object('user_id', r.user_id, 'role', r.role, 'reason', v_reason));
    END LOOP;
    v_logo := p.logo_object_key;
  END IF;
  UPDATE evals.partner x SET
    status = coalesce(p_status, x.status),
    revenue_share_bps = coalesce(p_revenue_share_bps, x.revenue_share_bps),
    agreement_note = CASE WHEN p_note IS NULL THEN x.agreement_note ELSE nullif(btrim(p_note), '') END,
    max_clients = coalesce(p_max_clients, x.max_clients),
    logo_object_key = CASE WHEN p_status = 'closed' THEN NULL ELSE x.logo_object_key END,
    logo_sha256 = CASE WHEN p_status = 'closed' THEN NULL ELSE x.logo_sha256 END,
    logo_bytes = CASE WHEN p_status = 'closed' THEN NULL ELSE x.logo_bytes END,
    logo_media_type = CASE WHEN p_status = 'closed' THEN NULL ELSE x.logo_media_type END,
    logo_updated_at = CASE WHEN p_status = 'closed' AND x.logo_object_key IS NOT NULL THEN now() ELSE x.logo_updated_at END,
    version = x.version + 1, updated_at = now()
  WHERE x.id = p_partner RETURNING * INTO n;
  PERFORM evals._partner_sync(p_partner);
  PERFORM evals._partner_audit(NULL, 'partner.updated', p_partner::text, jsonb_build_object('reason', v_reason,
    'before', jsonb_build_object('status', p.status, 'revenue_share_bps', p.revenue_share_bps, 'max_clients', p.max_clients),
    'after', jsonb_build_object('status', n.status, 'revenue_share_bps', n.revenue_share_bps, 'max_clients', n.max_clients)));
  RETURN QUERY SELECT n.status, n.version, v_logo;
END $$;

CREATE FUNCTION evals.partner_add_member(p_partner uuid, p_email text, p_role text, p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals, public AS $$
DECLARE v_reason text; uid text; previous text;
BEGIN
  PERFORM evals._partner_admin();
  v_reason := evals._partner_reason(p_reason);
  IF p_role IS NULL OR p_role NOT IN ('admin','member') OR p_email IS NULL OR length(p_email) > 254 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  PERFORM 1 FROM evals.partner WHERE id = p_partner AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_INACTIVE'; END IF;
  SELECT u.id INTO uid FROM public.auth_user u WHERE lower(u.email) = lower(btrim(p_email)) AND u."emailVerified" = true;
  IF uid IS NULL THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  SELECT role INTO previous FROM evals.partner_member WHERE partner_id = p_partner AND user_id = uid;
  IF previous = 'admin' AND p_role = 'member' AND evals._partner_orphans(p_partner) > 0
     AND NOT EXISTS (SELECT 1 FROM evals.partner_member WHERE partner_id = p_partner AND role = 'admin' AND user_id <> uid) THEN
    RAISE EXCEPTION 'PARTNER_LAST_ADMIN';
  END IF;
  INSERT INTO evals.partner_member (partner_id, user_id, role, added_by) VALUES (p_partner, uid, p_role, evals.actor_id())
  ON CONFLICT (partner_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  PERFORM evals._partner_sync(p_partner);
  PERFORM evals._partner_audit(NULL, CASE WHEN previous IS NULL THEN 'partner.member_added' ELSE 'partner.member_role_changed' END,
    p_partner::text, jsonb_build_object('user_id', uid, 'role', p_role, 'previous_role', previous, 'reason', v_reason));
  RETURN uid;
END $$;

CREATE FUNCTION evals.partner_remove_member(p_partner uuid, p_user_id text, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE v_reason text; previous text;
BEGIN
  PERFORM evals._partner_admin();
  v_reason := evals._partner_reason(p_reason);
  PERFORM 1 FROM evals.partner WHERE id = p_partner FOR UPDATE;
  SELECT role INTO previous FROM evals.partner_member WHERE partner_id = p_partner AND user_id = p_user_id;
  IF previous IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF previous = 'admin' AND evals._partner_orphans(p_partner) > 0
     AND NOT EXISTS (SELECT 1 FROM evals.partner_member WHERE partner_id = p_partner AND role = 'admin' AND user_id <> p_user_id) THEN
    RAISE EXCEPTION 'PARTNER_LAST_ADMIN';
  END IF;
  DELETE FROM evals.partner_member WHERE partner_id = p_partner AND user_id = p_user_id;
  PERFORM evals._partner_sync(p_partner);
  PERFORM evals._partner_audit(NULL, 'partner.member_removed', p_partner::text, jsonb_build_object('user_id', p_user_id, 'role', previous, 'reason', v_reason));
END $$;

/* ------------------------------------------------------------ clients --- */

-- A new client workspace managed by the partner (partner admins or platform
-- admins), on the partner plan: PAYG-sized limits (§6.5) until ops set the
-- agreement's, credits billing, no member cap. Idempotent per request key.
CREATE FUNCTION evals.partner_create_client(p_partner uuid, p_name text, p_request_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.actor_id(); p evals.partner; existing evals.partner_client; ws uuid; live integer;
BEGIN
  PERFORM evals._partner_require(p_partner, 'admin');
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  SELECT * INTO p FROM evals.partner WHERE id = p_partner FOR UPDATE;
  IF p.status <> 'active' THEN RAISE EXCEPTION 'PARTNER_INACTIVE'; END IF;
  SELECT * INTO existing FROM evals.partner_client WHERE partner_id = p_partner AND request_key = p_request_key;
  IF FOUND THEN
    IF (SELECT name FROM evals.workspace WHERE id = existing.org_id) IS DISTINCT FROM btrim(p_name) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN existing.org_id;
  END IF;
  SELECT count(*) INTO live FROM evals.partner_client c JOIN evals.workspace w ON w.id = c.org_id AND w.deleted_at IS NULL
    WHERE c.partner_id = p_partner AND c.unlinked_at IS NULL;
  IF live >= p.max_clients THEN RAISE EXCEPTION 'PARTNER_CLIENT_LIMIT'; END IF;
  INSERT INTO evals.workspace AS w (name, created_by) VALUES (btrim(p_name), actor) RETURNING w.id INTO ws;
  UPDATE evals.workspace_entitlement e SET plan = 'partner',
    max_systems = 10, max_tests_per_set = 500, max_runs_per_month = NULL, max_active_runs = 2, max_members = NULL,
    can_schedule = true, can_export = true,
    allowed_connection_types = ARRAY['https_json','imported_responses','openai_compatible','website']::text[],
    version = e.version + 1, updated_by = actor, updated_at = now()
  WHERE e.org_id = ws;
  INSERT INTO evals.partner_client (partner_id, org_id, access, origin, request_key, linked_by)
  VALUES (p_partner, ws, 'manage', 'created', p_request_key, actor);
  PERFORM evals._partner_sync(p_partner);
  PERFORM evals._partner_audit(ws, 'workspace.created', ws::text, jsonb_build_object('partner_id', p_partner));
  PERFORM evals._partner_audit(ws, 'partner.client_created', p_partner::text, jsonb_build_object('access', 'manage'));
  RETURN ws;
END $$;

-- Ops link an existing workspace to a partner (the client's agreement is the reason).
CREATE FUNCTION evals.partner_link_client(p_partner uuid, p_org uuid, p_access text, p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE v_reason text; p evals.partner; v_id uuid; live integer;
BEGIN
  PERFORM evals._partner_admin();
  v_reason := evals._partner_reason(p_reason);
  IF p_access IS NULL OR p_access NOT IN ('manage','work') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO p FROM evals.partner x WHERE x.id = p_partner FOR UPDATE;
  IF NOT FOUND OR p.status <> 'active' THEN RAISE EXCEPTION 'PARTNER_INACTIVE'; END IF;
  PERFORM 1 FROM evals.workspace w WHERE w.id = p_org AND w.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM evals.partner_client c WHERE c.org_id = p_org AND c.unlinked_at IS NULL) THEN RAISE EXCEPTION 'PARTNER_CLIENT_LINKED'; END IF;
  SELECT count(*) INTO live FROM evals.partner_client c JOIN evals.workspace w ON w.id = c.org_id AND w.deleted_at IS NULL
    WHERE c.partner_id = p_partner AND c.unlinked_at IS NULL;
  IF live >= p.max_clients THEN RAISE EXCEPTION 'PARTNER_CLIENT_LIMIT'; END IF;
  INSERT INTO evals.partner_client (partner_id, org_id, access, origin, link_reason, linked_by)
  VALUES (p_partner, p_org, p_access, 'linked', v_reason, evals.actor_id()) RETURNING partner_client.id INTO v_id;
  PERFORM evals._partner_sync(p_partner);
  PERFORM evals._partner_audit(p_org, 'partner.client_linked', p_partner::text, jsonb_build_object('access', p_access, 'reason', v_reason));
  RETURN v_id;
END $$;

CREATE FUNCTION evals.partner_unlink_client(p_partner uuid, p_org uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE v_reason text;
BEGIN
  PERFORM evals._partner_admin();
  v_reason := evals._partner_reason(p_reason);
  PERFORM 1 FROM evals.partner WHERE id = p_partner FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM evals.partner_client WHERE partner_id = p_partner AND org_id = p_org AND unlinked_at IS NULL) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF evals._partner_orphans(p_partner, p_org) > 0 THEN RAISE EXCEPTION 'PARTNER_CLIENT_ORPHAN'; END IF;
  UPDATE evals.partner_client SET unlinked_at = now(), unlinked_by = evals.actor_id(), unlink_reason = v_reason
    WHERE partner_id = p_partner AND org_id = p_org AND unlinked_at IS NULL;
  PERFORM evals._partner_sync(p_partner);
  PERFORM evals._partner_audit(p_org, 'partner.client_unlinked', p_partner::text, jsonb_build_object('reason', v_reason));
END $$;

/* ------------------------------------------------------ referral codes --- */

CREATE FUNCTION evals.partner_create_code(p_partner uuid, p_label text) RETURNS evals.partner_referral_code
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE c evals.partner_referral_code; candidate text; v_label text := nullif(btrim(coalesce(p_label, '')), '');
BEGIN
  PERFORM evals._partner_require(p_partner, 'admin');
  PERFORM 1 FROM evals.partner WHERE id = p_partner AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_INACTIVE'; END IF;
  IF v_label IS NOT NULL AND length(v_label) > 80 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF (SELECT count(*) FROM evals.partner_referral_code WHERE partner_id = p_partner AND revoked_at IS NULL) >= 20 THEN
    RAISE EXCEPTION 'PARTNER_CODE_LIMIT';
  END IF;
  LOOP
    candidate := 'cp-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    BEGIN
      INSERT INTO evals.partner_referral_code (partner_id, code, label, created_by)
      VALUES (p_partner, candidate, v_label, evals.actor_id()) RETURNING * INTO c;
      EXIT;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  PERFORM evals._partner_audit(NULL, 'partner.code_created', p_partner::text, jsonb_build_object('code_id', c.id));
  RETURN c;
END $$;

CREATE FUNCTION evals.partner_revoke_code(p_partner uuid, p_code_id uuid, p_reason text) RETURNS evals.partner_referral_code
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE c evals.partner_referral_code; v_reason text;
BEGIN
  PERFORM evals._partner_require(p_partner, 'admin');
  v_reason := evals._partner_reason(p_reason);
  UPDATE evals.partner_referral_code x SET revoked_at = coalesce(x.revoked_at, now()), revoked_by = coalesce(x.revoked_by, evals.actor_id()),
    revoke_reason = coalesce(x.revoke_reason, v_reason)
  WHERE x.partner_id = p_partner AND x.id = p_code_id RETURNING * INTO c;
  IF c.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  PERFORM evals._partner_audit(NULL, 'partner.code_revoked', p_partner::text, jsonb_build_object('code_id', c.id, 'reason', v_reason));
  RETURN c;
END $$;

/* ---------------------------------------------------------- attribution --- */

-- Records the referring partner of a workspace from a first-touch snapshot:
-- the `partner` label first, then `ref`, matched against a live code of an
-- active partner. One partner per workspace, first attribution wins.
CREATE FUNCTION evals._partner_attribute(p_org uuid, p_touch jsonb, p_via text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE k text; candidate text; c record; inserted uuid;
BEGIN
  IF p_touch IS NULL OR jsonb_typeof(p_touch) <> 'object' THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['partner','ref'] LOOP
    candidate := lower(btrim(coalesce(p_touch->>k, '')));
    CONTINUE WHEN candidate !~ '^cp-[0-9a-f]{10}$';
    SELECT rc.id, rc.partner_id INTO c FROM evals.partner_referral_code rc JOIN evals.partner p ON p.id = rc.partner_id
      WHERE rc.code = candidate AND rc.revoked_at IS NULL AND p.status = 'active';
    CONTINUE WHEN c.id IS NULL;
    INSERT INTO evals.partner_referral (org_id, partner_id, code_id, matched_key, attributed_via)
    VALUES (p_org, c.partner_id, c.id, k, p_via) ON CONFLICT (org_id) DO NOTHING RETURNING org_id INTO inserted;
    IF inserted IS NOT NULL THEN
      PERFORM evals._partner_audit(p_org, 'partner.referral_attributed', c.partner_id::text, jsonb_build_object('code_id', c.id, 'via', p_via));
    END IF;
    RETURN inserted IS NOT NULL;
  END LOOP;
  RETURN false;
END $$;

CREATE FUNCTION evals._partner_workspace_touch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  BEGIN
    PERFORM evals._partner_attribute(NEW.id, NEW.acquisition_attribution, 'signup');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'partner_attribution_failed';
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER partner_attribution AFTER INSERT OR UPDATE OF acquisition_attribution ON evals.workspace
  FOR EACH ROW WHEN (NEW.acquisition_attribution <> '{}'::jsonb) EXECUTE FUNCTION evals._partner_workspace_touch();

-- The first paid order of a referred workspace (any function that records it).
CREATE FUNCTION evals._partner_first_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals, billing AS $$
BEGIN
  BEGIN
    IF NEW.first_paid IS TRUE THEN PERFORM evals._partner_attribute(NEW.org_id, NEW.attribution, 'payment'); END IF;
    UPDATE evals.partner_referral r SET first_order_id = NEW.id, first_paid_at = NEW.paid_at,
      first_paid_net_cents = NEW.net_cents, first_paid_livemode = NEW.livemode
    WHERE r.org_id = NEW.org_id AND r.first_order_id IS NULL AND NEW.paid_at IS NOT NULL;
    IF FOUND THEN
      PERFORM evals._partner_audit(NEW.org_id, 'partner.referral_paid', NEW.id::text, jsonb_build_object('livemode', NEW.livemode));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'partner_first_payment_failed';
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER partner_first_payment AFTER UPDATE OF purchase_entry_id ON billing.top_up_order
  FOR EACH ROW WHEN (OLD.purchase_entry_id IS NULL AND NEW.purchase_entry_id IS NOT NULL)
  EXECUTE FUNCTION evals._partner_first_payment();

/* ------------------------------------------------------------- logo --- */

-- Sets (or, with NULLs, removes) the white-label logo. Returns the previous
-- object key so the caller can delete the replaced object.
CREATE FUNCTION evals.partner_set_logo(p_partner uuid, p_object_key text, p_sha256 text, p_bytes integer, p_media_type text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE previous text;
BEGIN
  PERFORM evals._partner_require(p_partner, 'admin');
  SELECT logo_object_key INTO previous FROM evals.partner WHERE id = p_partner AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_INACTIVE'; END IF;
  UPDATE evals.partner SET logo_object_key = p_object_key, logo_sha256 = p_sha256, logo_bytes = p_bytes, logo_media_type = p_media_type,
    logo_updated_at = now(), version = version + 1, updated_at = now()
  WHERE id = p_partner;
  PERFORM evals._partner_audit(NULL, CASE WHEN p_object_key IS NULL THEN 'partner.logo_removed' ELSE 'partner.logo_set' END,
    p_partner::text, jsonb_build_object('sha256', p_sha256, 'bytes', p_bytes, 'media_type', p_media_type));
  RETURN previous;
END $$;

-- The brand for a workspace's next PDF (web runtime, in that workspace's scope):
-- its live partner link, when the partner is active and has a logo.
CREATE FUNCTION evals.partner_pdf_brand(p_org uuid)
RETURNS TABLE (partner_id uuid, name text, logo_sha256 text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF NOT evals.is_admin() AND NOT EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id = p_org AND m.user_id = evals.actor_id()) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.name, p.logo_sha256 FROM evals.partner_client c JOIN evals.partner p ON p.id = c.partner_id
    WHERE c.org_id = p_org AND c.unlinked_at IS NULL AND p.status = 'active' AND p.logo_sha256 IS NOT NULL;
END $$;

-- The logo for a queued PDF (documents worker, in the job's workspace scope):
-- only while that partner still links the workspace and the logo is unchanged.
CREATE FUNCTION evals.partner_pdf_logo(p_org uuid, p_partner uuid, p_sha256 text)
RETURNS TABLE (name text, object_key text, byte_size integer, media_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT p.name, p.logo_object_key, p.logo_bytes, p.logo_media_type
    FROM evals.partner_client c JOIN evals.partner p ON p.id = c.partner_id
    WHERE c.org_id = p_org AND c.partner_id = p_partner AND c.unlinked_at IS NULL AND p.status = 'active' AND p.logo_sha256 = p_sha256;
END $$;

/* ---------------------------------------------------------- allowance --- */

CREATE FUNCTION evals.partner_set_allowance(p_partner uuid, p_monthly_credits bigint, p_valid_from date, p_valid_until date, p_reason text)
RETURNS evals.partner_allowance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE v_reason text; v_before evals.partner_allowance; a evals.partner_allowance;
BEGIN
  PERFORM evals._partner_admin();
  v_reason := evals._partner_reason(p_reason);
  IF p_monthly_credits IS NULL OR p_monthly_credits < 0 OR p_monthly_credits > 1000000000 OR p_valid_from IS NULL
     OR (p_valid_until IS NOT NULL AND p_valid_until <= p_valid_from) THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  PERFORM 1 FROM evals.partner WHERE id = p_partner AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_INACTIVE'; END IF;
  SELECT * INTO v_before FROM evals.partner_allowance WHERE partner_id = p_partner;
  INSERT INTO evals.partner_allowance AS x (partner_id, monthly_ucr, valid_from, valid_until, reason, set_by)
  VALUES (p_partner, p_monthly_credits * 1000000, p_valid_from, p_valid_until, v_reason, evals.actor_id())
  ON CONFLICT (partner_id) DO UPDATE SET monthly_ucr = EXCLUDED.monthly_ucr, valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until, reason = EXCLUDED.reason, set_by = EXCLUDED.set_by, updated_at = now(), version = x.version + 1
  RETURNING * INTO a;
  PERFORM evals._partner_audit(NULL, 'partner.allowance_set', p_partner::text, jsonb_build_object('reason', v_reason,
    'before', CASE WHEN v_before.partner_id IS NULL THEN NULL ELSE jsonb_build_object('monthly_ucr', v_before.monthly_ucr, 'valid_from', v_before.valid_from, 'valid_until', v_before.valid_until) END,
    'after', jsonb_build_object('monthly_ucr', a.monthly_ucr, 'valid_from', a.valid_from, 'valid_until', a.valid_until)));
  RETURN a;
END $$;

-- Ops grant credits from the partner's allowance into one of its live clients
-- (platform admins, in that workspace's scope). The ledger entry is a
-- billing.grant (source contract_allowance, ref partner); the month's grants
-- never exceed the allowance. Idempotent per partner and request key.
CREATE FUNCTION evals.partner_grant_allowance(p_partner uuid, p_org uuid, p_credits bigint, p_request_key text, p_reason text,
  p_expires_at timestamptz DEFAULT NULL)
RETURNS evals.partner_allowance_grant
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals, billing AS $$
DECLARE v_reason text; a evals.partner_allowance; g evals.partner_allowance_grant; e billing.ledger_entry;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date; v_period text; v_used bigint; v_amount bigint; v_expires timestamptz;
BEGIN
  PERFORM evals._partner_admin();
  v_reason := evals._partner_reason(p_reason);
  IF p_org IS NULL OR p_org IS DISTINCT FROM evals.org_id() THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501'; END IF;
  IF p_credits IS NULL OR p_credits < 1 OR p_credits > 1000000000 OR p_request_key IS NULL
     OR p_request_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  v_amount := p_credits * 1000000;
  SELECT * INTO a FROM evals.partner_allowance WHERE partner_id = p_partner FOR UPDATE;
  SELECT * INTO g FROM evals.partner_allowance_grant WHERE partner_id = p_partner AND request_key = p_request_key;
  IF g.id IS NOT NULL THEN
    IF g.org_id <> p_org OR g.amount_ucr <> v_amount THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN g;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.partner p WHERE p.id = p_partner AND p.status = 'active') THEN RAISE EXCEPTION 'PARTNER_INACTIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.partner_client c JOIN evals.workspace w ON w.id = c.org_id AND w.deleted_at IS NULL
      WHERE c.partner_id = p_partner AND c.org_id = p_org AND c.unlinked_at IS NULL) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF a.partner_id IS NULL OR v_today < a.valid_from OR (a.valid_until IS NOT NULL AND v_today >= a.valid_until) THEN
    RAISE EXCEPTION 'PARTNER_ALLOWANCE_INACTIVE';
  END IF;
  v_period := to_char(v_today, 'YYYY-MM');
  SELECT coalesce(sum(x.amount_ucr), 0) INTO v_used FROM evals.partner_allowance_grant x WHERE x.partner_id = p_partner AND x.period = v_period;
  IF v_used + v_amount > a.monthly_ucr THEN RAISE EXCEPTION 'PARTNER_ALLOWANCE_EXCEEDED'; END IF;
  -- Default: valid until the end of the next calendar month (UTC).
  v_expires := coalesce(p_expires_at, (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '2 months') AT TIME ZONE 'UTC');
  e := billing.grant(p_org, 'partner:' || p_partner || ':' || p_request_key, v_amount, 'contract_allowance', v_expires, v_reason,
    'partner_allowance', 'partner', p_partner::text, NULL);
  INSERT INTO evals.partner_allowance_grant (partner_id, org_id, period, amount_ucr, ledger_entry_id, request_key, reason, created_by)
  VALUES (p_partner, p_org, v_period, v_amount, e.id, p_request_key, v_reason, evals.actor_id()) RETURNING * INTO g;
  PERFORM evals._partner_audit(p_org, 'partner.allowance_granted', p_partner::text, jsonb_build_object('grant_id', g.id,
    'ledger_entry_id', e.id, 'amount_ucr', v_amount, 'period', v_period, 'reason', v_reason));
  RETURN g;
END $$;

/* -------------------------------------------------------------- reads --- */

-- Access check for API reads; a platform admin's read is audited as support.
CREATE FUNCTION evals.partner_access(p_partner uuid, p_need text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE r text;
BEGIN
  IF p_need IS NULL OR p_need NOT IN ('member','admin') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  r := evals._partner_require(p_partner, p_need);
  IF r = 'platform_admin' AND evals.partner_role(p_partner) IS NULL THEN
    PERFORM evals._partner_audit(NULL, 'support.partner_read', p_partner::text, '{}'::jsonb);
  ELSIF r = 'platform_admin' THEN
    r := evals.partner_role(p_partner);
  END IF;
  RETURN r;
END $$;

CREATE FUNCTION evals.partner_members(p_partner uuid)
RETURNS TABLE (user_id text, email text, name text, role text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, public AS $$
BEGIN
  PERFORM evals._partner_require(p_partner, 'member');
  RETURN QUERY SELECT m.user_id, u.email, u.name, m.role, m.created_at
    FROM evals.partner_member m JOIN public.auth_user u ON u.id = m.user_id
    WHERE m.partner_id = p_partner ORDER BY m.role, u.email;
END $$;

-- The partner's live clients and their activity. "This month" is the Madrid
-- calendar month, as in the statement.
CREATE FUNCTION evals.partner_clients(p_partner uuid)
RETURNS TABLE (org_id uuid, name text, access text, origin text, plan text, linked_at timestamptz, my_role text,
  last_activity timestamptz, evaluations integer, runs_this_month integer, last_run_status text, last_run_at timestamptz,
  latest_score numeric, latest_scored integer, report_at timestamptz, available_ucr bigint, used_this_month_ucr bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, billing AS $$
DECLARE month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid';
BEGIN
  PERFORM evals._partner_require(p_partner, 'member');
  RETURN QUERY
  SELECT w.id, w.name, c.access, c.origin, e.plan, c.linked_at,
    (SELECT m.role FROM evals.membership m WHERE m.org_id = w.id AND m.user_id = evals.actor_id()),
    GREATEST(w.created_at,
      (SELECT max(v.updated_at) FROM evals.evaluation v WHERE v.org_id = w.id),
      (SELECT max(r.updated_at) FROM evals.run r WHERE r.org_id = w.id)),
    (SELECT count(*)::integer FROM evals.evaluation v WHERE v.org_id = w.id AND v.archived_at IS NULL),
    (SELECT count(*)::integer FROM evals.run r WHERE r.org_id = w.id AND r.created_at >= month_start),
    lr.status, lr.updated_at,
    rep.score, rep.scored, rep.at,
    a.available_ucr,
    (SELECT coalesce(-sum(l.amount_ucr), 0)::bigint FROM billing.ledger_entry l
      WHERE l.org_id = w.id AND l.entry_type IN ('capture','action') AND l.created_at >= month_start)
  FROM evals.partner_client c
  JOIN evals.workspace w ON w.id = c.org_id AND w.deleted_at IS NULL
  LEFT JOIN evals.workspace_entitlement e ON e.org_id = w.id
  LEFT JOIN billing.credit_account a ON a.org_id = w.id
  LEFT JOIN LATERAL (SELECT r.status, r.updated_at FROM evals.run r WHERE r.org_id = w.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) lr ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN jsonb_typeof(rr.snapshot->'metrics'->'strict_pass_rate') = 'number'
             THEN round((rr.snapshot->'metrics'->>'strict_pass_rate')::numeric, 4) END AS score,
           CASE WHEN jsonb_typeof(rr.snapshot->'metrics'->'n_scorable') = 'number'
             THEN (rr.snapshot->'metrics'->>'n_scorable')::integer END AS scored,
           rp.updated_at AS at
    FROM evals.report rp JOIN evals.report_revision rr ON (rr.org_id, rr.id) = (rp.org_id, rp.current_revision_id)
    WHERE rp.org_id = w.id AND rp.publication_status = 'published' AND rp.archived_at IS NULL
    ORDER BY rp.updated_at DESC, rp.id DESC LIMIT 1) rep ON true
  WHERE c.partner_id = p_partner AND c.unlinked_at IS NULL
  ORDER BY c.linked_at DESC, w.id
  LIMIT 500;
END $$;

-- Referred workspaces and their first-year revenue in one Stripe mode: net
-- euros of paid top-ups within a year of the workspace's first payment in
-- that mode, without refunded or charged-back orders. NULL (never 0) while
-- the workspace has paid nothing in that mode.
CREATE FUNCTION evals.partner_referrals(p_partner uuid, p_livemode boolean)
RETURNS TABLE (org_id uuid, workspace text, code text, matched_key text, attributed_via text, attributed_at timestamptz,
  first_paid_at timestamptz, paid_orders integer, revenue_net_cents bigint, revenue_share_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, billing AS $$
DECLARE bps integer;
BEGIN
  PERFORM evals._partner_require(p_partner, 'member');
  IF p_livemode IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT revenue_share_bps INTO bps FROM evals.partner WHERE id = p_partner;
  RETURN QUERY
  WITH f AS (
    SELECT r.org_id, min(o.paid_at) AS first_at FROM evals.partner_referral r
    JOIN billing.top_up_order o ON o.org_id = r.org_id AND o.livemode = p_livemode AND o.paid_at IS NOT NULL
    WHERE r.partner_id = p_partner GROUP BY r.org_id),
  rev AS (
    SELECT f.org_id, f.first_at,
      count(*) FILTER (WHERE o.paid_at < f.first_at + interval '1 year')::integer AS n,
      coalesce(sum(o.net_cents) FILTER (WHERE o.paid_at < f.first_at + interval '1 year' AND o.status NOT IN ('refunded','charged_back')), 0)::bigint AS net
    FROM f JOIN billing.top_up_order o ON o.org_id = f.org_id AND o.livemode = p_livemode AND o.paid_at IS NOT NULL
    GROUP BY f.org_id, f.first_at)
  SELECT r.org_id, w.name, rc.code, r.matched_key, r.attributed_via, r.attributed_at,
    rev.first_at, coalesce(rev.n, 0), rev.net,
    CASE WHEN rev.net IS NULL THEN NULL ELSE round(rev.net * bps / 10000.0)::bigint END
  FROM evals.partner_referral r
  JOIN evals.workspace w ON w.id = r.org_id
  JOIN evals.partner_referral_code rc ON rc.id = r.code_id
  LEFT JOIN rev ON rev.org_id = r.org_id
  WHERE r.partner_id = p_partner
  ORDER BY r.attributed_at DESC, r.org_id
  LIMIT 1000;
END $$;

-- The monthly statement for one Madrid calendar month and one Stripe mode,
-- straight from the orders and the ledger:
--   referral_payment  each paid top-up of a referred workspace in the month,
--                     within its first year (net, and the share at the
--                     partner's rate);
--   referral_reversal each such order refunded or charged back in the month
--                     (negative, with the same share);
--   allowance_grant   each allowance grant booked in the month (ledger amount);
--   client_usage      per client, credits used in the month while linked
--                     (capture and action entries) and credits returned
--                     (refunds and reversals of those entries).
CREATE FUNCTION evals.partner_statement(p_partner uuid, p_month date, p_livemode boolean)
RETURNS TABLE (section text, occurred_at timestamptz, org_id uuid, workspace text, reference text, detail text,
  net_cents bigint, share_cents bigint, credits_ucr bigint, returned_ucr bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, billing AS $$
DECLARE bps integer; m_from timestamptz; m_to timestamptz;
BEGIN
  PERFORM evals._partner_require(p_partner, 'member');
  IF p_month IS NULL OR p_month <> date_trunc('month', p_month)::date OR p_livemode IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT revenue_share_bps INTO bps FROM evals.partner WHERE id = p_partner;
  m_from := p_month::timestamp AT TIME ZONE 'Europe/Madrid';
  m_to := (p_month + interval '1 month')::timestamp AT TIME ZONE 'Europe/Madrid';
  RETURN QUERY
  WITH first_paid AS (
    SELECT r.org_id, min(o.paid_at) AS first_at FROM evals.partner_referral r
    JOIN billing.top_up_order o ON o.org_id = r.org_id AND o.livemode = p_livemode AND o.paid_at IS NOT NULL
    WHERE r.partner_id = p_partner GROUP BY r.org_id),
  orders AS (
    SELECT o.*, w.name AS wname,
      CASE WHEN o.status = 'refunded' THEN o.refunded_at
           WHEN o.status = 'charged_back' THEN coalesce((SELECT l.created_at FROM billing.ledger_entry l
             WHERE l.org_id = o.org_id AND l.idempotency_key = 'chargeback:' || o.id), o.updated_at) END AS reversed_at
    FROM first_paid f JOIN billing.top_up_order o ON o.org_id = f.org_id AND o.livemode = p_livemode AND o.paid_at IS NOT NULL
      AND o.paid_at < f.first_at + interval '1 year'
    JOIN evals.workspace w ON w.id = o.org_id),
  linked AS (
    SELECT c.org_id, c.linked_at, c.unlinked_at FROM evals.partner_client c WHERE c.partner_id = p_partner),
  client_use AS (
    SELECT l.org_id,
      coalesce(-sum(l.amount_ucr) FILTER (WHERE l.entry_type IN ('capture','action')), 0)::bigint AS used,
      coalesce(sum(l.amount_ucr) FILTER (WHERE l.entry_type IN ('refund','reversal') AND EXISTS (
        SELECT 1 FROM billing.ledger_entry t WHERE t.org_id = l.org_id AND t.id = l.reverses_entry_id AND t.entry_type IN ('capture','action'))), 0)::bigint AS returned
    FROM billing.ledger_entry l
    WHERE l.created_at >= m_from AND l.created_at < m_to
      AND EXISTS (SELECT 1 FROM linked k WHERE k.org_id = l.org_id AND l.created_at >= k.linked_at AND (k.unlinked_at IS NULL OR l.created_at < k.unlinked_at))
    GROUP BY l.org_id)
  SELECT * FROM (
    SELECT 'referral_payment'::text, o.paid_at, o.org_id, o.wname, o.id::text, o.kind, o.net_cents,
      round(o.net_cents * bps / 10000.0)::bigint, NULL::bigint, NULL::bigint
    FROM orders o WHERE o.paid_at >= m_from AND o.paid_at < m_to
    UNION ALL
    SELECT 'referral_reversal', o.reversed_at, o.org_id, o.wname, o.id::text, o.status, -o.net_cents,
      -round(o.net_cents * bps / 10000.0)::bigint, NULL, NULL
    FROM orders o WHERE o.reversed_at >= m_from AND o.reversed_at < m_to
    UNION ALL
    SELECT 'allowance_grant', l.created_at, g.org_id, w.name, l.id::text, g.period, NULL, NULL, l.amount_ucr, NULL
    FROM evals.partner_allowance_grant g
    JOIN billing.ledger_entry l ON l.org_id = g.org_id AND l.id = g.ledger_entry_id
    JOIN evals.workspace w ON w.id = g.org_id
    WHERE g.partner_id = p_partner AND l.created_at >= m_from AND l.created_at < m_to
    UNION ALL
    SELECT 'client_usage', NULL::timestamptz, u.org_id, w.name, NULL, NULL, NULL, NULL, u.used - u.returned, u.returned
    FROM client_use u JOIN evals.workspace w ON w.id = u.org_id
    WHERE u.used <> 0 OR u.returned <> 0
  ) s(section, occurred_at, org_id, workspace, reference, detail, net_cents, share_cents, credits_ucr, returned_ucr)
  ORDER BY CASE s.section WHEN 'referral_payment' THEN 1 WHEN 'referral_reversal' THEN 2 WHEN 'allowance_grant' THEN 3 ELSE 4 END,
    s.occurred_at NULLS LAST, s.workspace, s.reference;
END $$;

/* -------------------------------------- plan caps (093): partner people --- */

-- Partner people never count against a client's member cap, like operators.
CREATE OR REPLACE FUNCTION evals.enforce_plan_members() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE cap integer;
BEGIN
  SELECT max_members INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id;
  IF cap IS NULL THEN RETURN NEW; END IF;
  SELECT max_members INTO cap FROM evals.workspace_entitlement WHERE org_id = NEW.org_id FOR NO KEY UPDATE;
  IF cap IS NOT NULL AND
     (SELECT count(*) FROM evals.membership m WHERE m.org_id = NEW.org_id AND m.role <> 'operator' AND m.partner_id IS NULL)
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
    (SELECT count(*)::integer FROM evals.membership m WHERE m.org_id = p_org_id AND m.role <> 'operator' AND m.partner_id IS NULL),
    (SELECT count(*)::integer FROM evals.invitation i WHERE i.org_id = p_org_id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now());
END $$;

/* ------------------------------------------------------------- access --- */

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['partner','partner_member','partner_client','partner_referral_code','partner_referral',
    'partner_allowance','partner_allowance_grant'] LOOP
    EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON evals.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON evals.%I TO evals_runtime', t);
  END LOOP;
END $$;
CREATE POLICY partner_read ON evals.partner FOR SELECT USING (evals.is_admin() OR evals.partner_role(id) IS NOT NULL);
CREATE POLICY partner_member_read ON evals.partner_member FOR SELECT
  USING (evals.is_admin() OR user_id = evals.actor_id() OR evals.partner_role(partner_id) IS NOT NULL);
-- The client's own members see their workspace's link (who manages it).
CREATE POLICY partner_client_read ON evals.partner_client FOR SELECT
  USING (evals.is_admin() OR evals.partner_role(partner_id) IS NOT NULL
    OR (org_id = evals.org_id() AND EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id = partner_client.org_id AND m.user_id = evals.actor_id())));
CREATE POLICY partner_code_read ON evals.partner_referral_code FOR SELECT USING (evals.is_admin() OR evals.partner_role(partner_id) IS NOT NULL);
CREATE POLICY partner_referral_read ON evals.partner_referral FOR SELECT USING (evals.is_admin() OR evals.partner_role(partner_id) IS NOT NULL);
CREATE POLICY partner_allowance_read ON evals.partner_allowance FOR SELECT USING (evals.is_admin() OR evals.partner_role(partner_id) IS NOT NULL);
CREATE POLICY partner_grant_read ON evals.partner_allowance_grant FOR SELECT USING (evals.is_admin() OR evals.partner_role(partner_id) IS NOT NULL);

REVOKE ALL ON FUNCTION
  evals.partner_role(uuid), evals._partner_audit(uuid, text, text, jsonb), evals._partner_reason(text),
  evals._partner_require(uuid, text), evals._partner_admin(), evals._partner_desired(uuid), evals._partner_sync(uuid),
  evals._partner_orphans(uuid, uuid), evals.partner_create(text, integer, text, integer, text),
  evals.partner_update(uuid, text, integer, text, integer, text), evals.partner_add_member(uuid, text, text, text),
  evals.partner_remove_member(uuid, text, text), evals.partner_create_client(uuid, text, text),
  evals.partner_link_client(uuid, uuid, text, text), evals.partner_unlink_client(uuid, uuid, text),
  evals.partner_create_code(uuid, text), evals.partner_revoke_code(uuid, uuid, text),
  evals._partner_attribute(uuid, jsonb, text), evals._partner_workspace_touch(), evals._partner_first_payment(),
  evals.partner_set_logo(uuid, text, text, integer, text), evals.partner_pdf_brand(uuid), evals.partner_pdf_logo(uuid, uuid, text),
  evals.partner_set_allowance(uuid, bigint, date, date, text), evals.partner_grant_allowance(uuid, uuid, bigint, text, text, timestamptz),
  evals.partner_access(uuid, text), evals.partner_members(uuid), evals.partner_clients(uuid),
  evals.partner_referrals(uuid, boolean), evals.partner_statement(uuid, date, boolean)
FROM PUBLIC;
-- The web runtime (and the scheduler, a member of it). Every function checks the actor itself.
GRANT EXECUTE ON FUNCTION
  evals.partner_role(uuid), evals.partner_create(text, integer, text, integer, text),
  evals.partner_update(uuid, text, integer, text, integer, text), evals.partner_add_member(uuid, text, text, text),
  evals.partner_remove_member(uuid, text, text), evals.partner_create_client(uuid, text, text),
  evals.partner_link_client(uuid, uuid, text, text), evals.partner_unlink_client(uuid, uuid, text),
  evals.partner_create_code(uuid, text), evals.partner_revoke_code(uuid, uuid, text),
  evals.partner_set_logo(uuid, text, text, integer, text), evals.partner_pdf_brand(uuid),
  evals.partner_set_allowance(uuid, bigint, date, date, text), evals.partner_grant_allowance(uuid, uuid, bigint, text, text, timestamptz),
  evals.partner_access(uuid, text), evals.partner_members(uuid), evals.partner_clients(uuid),
  evals.partner_referrals(uuid, boolean), evals.partner_statement(uuid, date, boolean)
TO evals_runtime;
-- The documents worker reads a branded PDF's logo reference, nothing else.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evals_document') THEN
    GRANT EXECUTE ON FUNCTION evals.partner_pdf_logo(uuid, uuid, text) TO evals_document;
  END IF;
END $$;

COMMIT;
