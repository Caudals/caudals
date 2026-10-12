-- Prospect snapshots and the weekly ops digest (launch L-21; spec v2 P-34 v2,
-- P-35, P-36; evals spec §16.5).
--
-- A prospect snapshot is an operator-made evaluation of a third party's public
-- chat, in a sandbox workspace of its own. The snapshot row is the testing
-- basis record: who made it, the target and help-centre hosts, the basis,
-- the approved scope (ordinary questions, public information, no adversarial
-- tests, private sharing only) and the traffic limits. Every rule is enforced
-- where the rows are written, so no code path skips them:
--   * creation claims a slot of the per-day cap (Europe/Madrid days) and at
--     most one snapshot per target host per 24 hours;
--   * the sandbox entitlement allows one website system, a small test set,
--     three runs a month and one active run;
--   * a run in a sandbox needs a website target within the recorded traffic
--     limits and a test set of ordinary grounded questions only;
--   * a share of a sandbox report is a bearer link labelled "external
--     snapshot" and never lives longer than 30 days.
-- Snapshot rows are visible to platform operators and admins only.
--
-- The digest tables let the scheduler claim one send per week and read
-- platform-wide aggregates through SECURITY DEFINER functions; customers and
-- workers never qualify.
--
-- Forward repair: every object is additive. The rollback refuses while any
-- snapshot or digest send exists.
BEGIN;

/* ------------------------------------------------------------- helpers --- */

-- Platform operators and admins (the ops console). Customers never qualify.
CREATE FUNCTION evals.is_platform_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = evals.actor_id() AND role IN ('operator','platform_admin'))
$$;
REVOKE ALL ON FUNCTION evals.is_platform_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.is_platform_staff() TO evals_runtime;

/* ------------------------------------------------------------ snapshots --- */

CREATE TABLE evals.prospect_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The sandbox workspace; one snapshot per sandbox.
  org_id uuid NOT NULL UNIQUE REFERENCES evals.workspace(id),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 200),
  company text NOT NULL CHECK (length(company) BETWEEN 1 AND 120),
  target_url text NOT NULL CHECK (length(target_url) <= 2048 AND target_url ~ '^https://'),
  target_host text NOT NULL CHECK (target_host ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$'),
  help_url text NOT NULL CHECK (length(help_url) <= 2048 AND help_url ~ '^https://'),
  help_host text NOT NULL CHECK (help_host ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$'),
  locale text NOT NULL CHECK (locale IN ('en','es')),
  testing_basis text NOT NULL CHECK (testing_basis IN ('public_information','owner_permission')),
  basis_note text CHECK (basis_note IS NULL OR length(basis_note) BETWEEN 1 AND 500),
  -- Approved scope: ordinary questions on public information, private link only.
  scope jsonb NOT NULL CHECK (
    jsonb_typeof(scope) = 'object' AND scope->>'adversarial' = 'false'
    AND scope->>'questions' = 'ordinary' AND scope->>'information' = 'public'
    AND scope->>'sharing' = 'private_link' AND scope->>'public_naming' = 'false'),
  traffic_limit jsonb NOT NULL CHECK (
    jsonb_typeof(traffic_limit) = 'object'
    AND jsonb_typeof(traffic_limit->'requests_per_minute') = 'number' AND (traffic_limit->>'requests_per_minute')::numeric BETWEEN 1 AND 6
    AND jsonb_typeof(traffic_limit->'concurrent_sessions') = 'number' AND (traffic_limit->>'concurrent_sessions')::numeric = 1
    AND jsonb_typeof(traffic_limit->'max_questions') = 'number' AND (traffic_limit->>'max_questions')::numeric BETWEEN 1 AND 20
    AND jsonb_typeof(traffic_limit->'runs_per_month') = 'number' AND (traffic_limit->>'runs_per_month')::numeric BETWEEN 1 AND 3),
  project_id uuid,
  evaluation_id uuid,
  target_id uuid,
  share_id uuid,
  share_expires_at timestamptz,
  shared_at timestamptz,
  crm_draft_id uuid,
  madrid_day date NOT NULL,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, request_key),
  FOREIGN KEY (org_id, project_id) REFERENCES evals.project(org_id, id),
  FOREIGN KEY (org_id, evaluation_id) REFERENCES evals.evaluation(org_id, id),
  FOREIGN KEY (org_id, target_id) REFERENCES evals.target(org_id, id),
  FOREIGN KEY (org_id, share_id) REFERENCES evals.share_grant(org_id, id),
  FOREIGN KEY (org_id, crm_draft_id) REFERENCES evals.crm_handoff_draft(org_id, id),
  CHECK ((share_id IS NULL) = (share_expires_at IS NULL)),
  CHECK (share_expires_at IS NULL OR share_expires_at <= shared_at + interval '30 days')
);
CREATE INDEX prospect_snapshot_host ON evals.prospect_snapshot (target_host, created_at DESC);
CREATE INDEX prospect_snapshot_created ON evals.prospect_snapshot (created_at DESC);

-- Snapshots created per Europe/Madrid day, against the cap in force then.
CREATE TABLE evals.prospect_snapshot_day (
  day date PRIMARY KEY,
  created integer NOT NULL DEFAULT 0 CHECK (created >= 0),
  cap integer NOT NULL CHECK (cap BETWEEN 1 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evals.prospect_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.prospect_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON evals.prospect_snapshot FOR SELECT USING (evals.is_platform_staff());
CREATE POLICY staff_update ON evals.prospect_snapshot FOR UPDATE USING (evals.is_platform_staff()) WITH CHECK (evals.is_platform_staff());
ALTER TABLE evals.prospect_snapshot_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.prospect_snapshot_day FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON evals.prospect_snapshot_day FOR SELECT USING (evals.is_platform_staff());
-- Rows are created only by evals.create_prospect_snapshot; operators link the
-- sandbox's objects, its share and its CRM draft afterwards.
GRANT SELECT ON evals.prospect_snapshot, evals.prospect_snapshot_day TO evals_runtime;
GRANT UPDATE (project_id, evaluation_id, target_id, share_id, share_expires_at, shared_at, crm_draft_id, updated_at)
  ON evals.prospect_snapshot TO evals_runtime;

-- Is this workspace a prospect sandbox? Callable from triggers under any role.
CREATE FUNCTION evals.prospect_sandbox(p_org_id uuid) RETURNS evals.prospect_snapshot
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT * FROM evals.prospect_snapshot WHERE org_id = p_org_id
$$;
REVOKE ALL ON FUNCTION evals.prospect_sandbox(uuid) FROM PUBLIC;

-- One call creates the sandbox workspace, its limits and the basis record.
-- Idempotent per operator and request key; the cap counts every new snapshot.
CREATE FUNCTION evals.create_prospect_snapshot(
  p_request_key text, p_company text, p_target_url text, p_target_host text, p_help_url text, p_help_host text,
  p_locale text, p_basis text, p_basis_note text, p_scope jsonb, p_traffic jsonb, p_daily_cap integer)
RETURNS TABLE (id uuid, org_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  existing evals.prospect_snapshot%ROWTYPE;
  today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  used integer;
  workspace_id uuid;
  snapshot_id uuid;
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = actor AND role IN ('operator','platform_admin')) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_daily_cap IS NULL OR p_daily_cap NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  -- One snapshot at a time, so the cap and the host rule cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('evals.prospect_snapshot', 0));
  SELECT * INTO existing FROM evals.prospect_snapshot s WHERE s.created_by = actor AND s.request_key = p_request_key;
  IF FOUND THEN
    IF existing.target_host IS DISTINCT FROM p_target_host OR existing.help_host IS DISTINCT FROM p_help_host OR existing.company IS DISTINCT FROM p_company THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT existing.id, existing.org_id, false;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM evals.prospect_snapshot s WHERE s.target_host = p_target_host AND s.created_at > now() - interval '24 hours') THEN
    RAISE EXCEPTION 'SNAPSHOT_HOST_LIMIT';
  END IF;
  INSERT INTO evals.prospect_snapshot_day AS d (day, created, cap) VALUES (today, 1, p_daily_cap)
  ON CONFLICT (day) DO UPDATE SET created = d.created + 1, cap = p_daily_cap, updated_at = now()
    WHERE d.created < p_daily_cap
  RETURNING d.created INTO used;
  IF used IS NULL THEN RAISE EXCEPTION 'SNAPSHOT_DAILY_CAP'; END IF;

  INSERT INTO evals.workspace AS ws (name, created_by) VALUES (left('Snapshot · ' || p_company, 160), actor) RETURNING ws.id INTO workspace_id;
  INSERT INTO evals.membership (org_id, user_id, role) VALUES (workspace_id, actor, 'operator');
  -- Traffic limits as entitlements (the 075 triggers enforce them): one
  -- website system, the snapshot's test count, a few runs a month, one at a time.
  UPDATE evals.workspace_entitlement e SET
    max_systems = 1, max_tests_per_set = (p_traffic->>'max_questions')::integer,
    max_runs_per_month = (p_traffic->>'runs_per_month')::integer, max_active_runs = 1,
    allowed_connection_types = ARRAY['website']::text[], can_schedule = false, review_allowance = 0,
    version = e.version + 1, updated_by = actor, updated_at = now()
  WHERE e.org_id = workspace_id;
  INSERT INTO evals.prospect_snapshot AS ps (org_id, request_key, company, target_url, target_host, help_url, help_host,
    locale, testing_basis, basis_note, scope, traffic_limit, madrid_day, created_by)
  VALUES (workspace_id, p_request_key, p_company, p_target_url, p_target_host, p_help_url, p_help_host,
    p_locale, p_basis, nullif(btrim(coalesce(p_basis_note, '')), ''), p_scope, p_traffic, today, actor)
  RETURNING ps.id INTO snapshot_id;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id) VALUES (workspace_id, actor, 'workspace.created', workspace_id::text);
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id) VALUES (workspace_id, actor, 'prospect_snapshot.created', snapshot_id::text);
  RETURN QUERY SELECT snapshot_id, workspace_id, true;
END $$;
REVOKE ALL ON FUNCTION evals.create_prospect_snapshot(text,text,text,text,text,text,text,text,text,jsonb,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.create_prospect_snapshot(text,text,text,text,text,text,text,text,text,jsonb,jsonb,integer) TO evals_runtime;

/* --------------------------------------------------- policy enforcement --- */

-- The testing basis of a third-party snapshot: only in a sandbox, never adversarial.
CREATE FUNCTION evals.guard_external_snapshot_basis() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF NEW.basis = 'external_snapshot' AND ((evals.prospect_sandbox(NEW.org_id)).id IS NULL OR NEW.scope->>'adversarial' IS DISTINCT FROM 'false') THEN
    RAISE EXCEPTION 'SNAPSHOT_POLICY_BLOCKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_external_snapshot_basis BEFORE INSERT ON evals.authorization_record
  FOR EACH ROW EXECUTE FUNCTION evals.guard_external_snapshot_basis();

-- A sandbox run: a website within the recorded traffic limits, and a test set
-- of ordinary grounded questions no larger than the snapshot allows.
CREATE FUNCTION evals.enforce_prospect_snapshot_run() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  snap evals.prospect_snapshot%ROWTYPE;
  target jsonb;
  cases integer;
  blocked integer;
BEGIN
  snap := evals.prospect_sandbox(NEW.org_id);
  IF snap.id IS NULL THEN RETURN NEW; END IF;
  SELECT document INTO target FROM evals.target_revision WHERE org_id = NEW.org_id AND id = NEW.target_revision_id;
  IF target IS NULL OR target->>'kind' <> 'website' OR NEW.execution_mode <> 'deployed_system'
     OR (target->>'requests_per_minute')::numeric > (snap.traffic_limit->>'requests_per_minute')::numeric
     OR (target->>'concurrent_sessions')::numeric > 1 THEN
    RAISE EXCEPTION 'SNAPSHOT_POLICY_BLOCKED';
  END IF;
  SELECT count(*),
         count(*) FILTER (WHERE cr.document->>'task_type' IS DISTINCT FROM 'grounded_qa'
           OR cr.document->'scenario'->>'mode' IN ('tool_workflow')
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(cr.document->'tags', '[]'::jsonb)) tag
                      WHERE tag ~* '(adversar|prompt[ _-]*inject|jailbreak|prompt[ _-]*(extract|leak)|system[ _-]*prompt|exfiltrat|red[ _-]*team)'))
    INTO cases, blocked
  FROM evals.suite_case sc JOIN evals.case_revision cr ON (cr.org_id, cr.id) = (sc.org_id, sc.case_revision_id)
  WHERE sc.org_id = NEW.org_id AND sc.suite_version_id = NEW.suite_version_id;
  IF blocked > 0 OR cases = 0 OR cases > (snap.traffic_limit->>'max_questions')::integer THEN
    RAISE EXCEPTION 'SNAPSHOT_POLICY_BLOCKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_prospect_snapshot_run BEFORE INSERT ON evals.run
  FOR EACH ROW EXECUTE FUNCTION evals.enforce_prospect_snapshot_run();

-- Shares of a sandbox report: a labelled bearer link, at most 30 days.
ALTER TABLE evals.share_grant ADD COLUMN label text CHECK (label IS NULL OR label = 'external_snapshot');
CREATE FUNCTION evals.enforce_prospect_snapshot_share() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF (evals.prospect_sandbox(NEW.org_id)).id IS NULL THEN
    IF NEW.label IS NOT NULL THEN RAISE EXCEPTION 'SNAPSHOT_POLICY_BLOCKED'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.audience <> 'bearer' THEN RAISE EXCEPTION 'SNAPSHOT_POLICY_BLOCKED'; END IF;
  NEW.label := 'external_snapshot';
  NEW.expires_at := LEAST(NEW.expires_at, now() + interval '30 days');
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_prospect_snapshot_share BEFORE INSERT ON evals.share_grant
  FOR EACH ROW EXECUTE FUNCTION evals.enforce_prospect_snapshot_share();

REVOKE ALL ON FUNCTION evals.guard_external_snapshot_basis(), evals.enforce_prospect_snapshot_run(), evals.enforce_prospect_snapshot_share() FROM PUBLIC;

/* -------------------------------------------- growth and client details --- */

-- Per-workspace details for the ops growth and client views (P-34 v2, §5.3):
-- aggregates and the owner's email domain only, for the workspaces the actor
-- may see. credits_bought stays NULL until a purchase exists.
CREATE FUNCTION evals.ops_workspace_details()
RETURNS TABLE (org_id uuid, name text, kind text, plan text, billing_mode text, available_credits numeric,
  credits_bought numeric, last_activity timestamptz, owner_domain text, connection_kind text,
  latest_score numeric, latest_scored integer, report_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, billing AS $$
DECLARE actor text := evals.actor_id(); admin boolean;
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = actor AND role IN ('operator','platform_admin')) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  admin := EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = actor AND role = 'platform_admin');
  RETURN QUERY
  SELECT w.id, w.name,
    CASE WHEN p.id IS NOT NULL THEN 'snapshot' WHEN e.plan = 'free' THEN 'free' ELSE 'client' END,
    e.plan, a.billing_mode,
    round(a.available_ucr / 1000000.0, 2),
    (SELECT round(sum(l.amount_ucr) / 1000000.0, 2) FROM billing.ledger_entry l WHERE l.org_id = w.id AND l.entry_type = 'purchase'),
    GREATEST(w.created_at,
      (SELECT max(v.updated_at) FROM evals.evaluation v WHERE v.org_id = w.id),
      (SELECT max(r.updated_at) FROM evals.run r WHERE r.org_id = w.id)),
    (SELECT min(split_part(lower(u.email), '@', 2)) FROM evals.membership m JOIN public.auth_user u ON u.id = m.user_id
      WHERE m.org_id = w.id AND m.role = 'owner'),
    (SELECT tr.document->>'kind' FROM evals.target t JOIN evals.target_revision tr ON (tr.org_id, tr.target_id) = (t.org_id, t.id)
      WHERE t.org_id = w.id AND t.archived_at IS NULL ORDER BY tr.created_at DESC, tr.id DESC LIMIT 1),
    rep.score, rep.scored, rep.at,
    w.created_at
  FROM evals.workspace w
  LEFT JOIN evals.workspace_entitlement e ON e.org_id = w.id
  LEFT JOIN billing.credit_account a ON a.org_id = w.id
  LEFT JOIN evals.prospect_snapshot p ON p.org_id = w.id
  LEFT JOIN LATERAL (
    SELECT CASE WHEN jsonb_typeof(rr.snapshot->'metrics'->'strict_pass_rate') = 'number'
             THEN round((rr.snapshot->'metrics'->>'strict_pass_rate')::numeric, 4) END AS score,
           CASE WHEN jsonb_typeof(rr.snapshot->'metrics'->'n_scorable') = 'number'
             THEN (rr.snapshot->'metrics'->>'n_scorable')::integer END AS scored,
           rp.updated_at AS at
    FROM evals.report rp JOIN evals.report_revision rr ON (rr.org_id, rr.id) = (rp.org_id, rp.current_revision_id)
    WHERE rp.org_id = w.id AND rp.publication_status = 'published' AND rp.archived_at IS NULL
    ORDER BY rp.updated_at DESC, rp.id DESC LIMIT 1) rep ON true
  WHERE w.deleted_at IS NULL
    AND (admin OR EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id = w.id AND m.user_id = actor))
  ORDER BY w.created_at DESC, w.id
  LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION evals.ops_workspace_details() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.ops_workspace_details() TO evals_runtime;

/* ------------------------------------------------------------- digest --- */

CREATE TABLE evals.ops_digest_send (
  week_start date PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 20),
  provider_id text CHECK (provider_id IS NULL OR length(provider_id) BETWEEN 1 AND 200),
  reason_code text CHECK (reason_code IS NULL OR reason_code ~ '^[a-z0-9_]{1,64}$'),
  -- Aggregate counts only; no addresses, no names.
  summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object' AND octet_length(summary::text) <= 4096),
  claimed_by text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE evals.ops_digest_send ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.ops_digest_send FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON evals.ops_digest_send FOR SELECT USING (evals.is_platform_staff());
GRANT SELECT ON evals.ops_digest_send TO evals_runtime;

-- The scheduler's service identity, or a platform admin running it by hand.
CREATE FUNCTION evals._digest_actor() RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals.actor_id();
BEGIN
  IF actor = 'service:evals-scheduler' OR EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = actor AND role = 'platform_admin') THEN
    RETURN actor;
  END IF;
  RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION evals._digest_actor() FROM PUBLIC;

-- Claims the week's send. A failed or stalled claim is retried after 15 minutes, at most five times.
CREATE FUNCTION evals.claim_ops_digest(p_week date) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals._digest_actor(); claimed boolean;
BEGIN
  IF p_week IS NULL OR extract(isodow FROM p_week) <> 1 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  INSERT INTO evals.ops_digest_send AS d (week_start, status, claimed_by) VALUES (p_week, 'sending', actor)
  ON CONFLICT (week_start) DO UPDATE SET status = 'sending', attempts = d.attempts + 1, claimed_by = actor, claimed_at = now(), reason_code = NULL
    WHERE d.status <> 'sent' AND d.attempts < 5 AND d.claimed_at < now() - interval '15 minutes'
  RETURNING true INTO claimed;
  RETURN coalesce(claimed, false);
END $$;
CREATE FUNCTION evals.finish_ops_digest(p_week date, p_sent boolean, p_provider_id text, p_reason text, p_summary jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE actor text := evals._digest_actor();
BEGIN
  UPDATE evals.ops_digest_send SET status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
    provider_id = left(p_provider_id, 200), reason_code = p_reason, summary = coalesce(p_summary, '{}'::jsonb),
    sent_at = CASE WHEN p_sent THEN now() END
  WHERE week_start = p_week AND status = 'sending' AND claimed_by = actor;
END $$;

-- Platform-wide aggregates: the period's §7.11 funnel, snapshots, failed
-- demos by reason and new sign-ups to call, plus the current stuck runs
-- (no progress for two hours), credit holds older than 24 hours and
-- low-balance accounts (company, owner's email
-- domain, source, stage; never an address or a person's name). Prospect
-- sandboxes are excluded from the funnel.
CREATE FUNCTION evals.ops_digest_data(p_from timestamptz, p_to timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals, billing AS $$
DECLARE actor text := evals.actor_id(); result jsonb;
BEGIN
  IF actor IS NULL OR NOT (actor = 'service:evals-scheduler'
     OR EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = actor AND role IN ('operator','platform_admin'))) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '35 days' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  WITH ev AS MATERIALIZED (
    SELECT e.event_name, e.org_id, e.session_id, e.metadata, e.attribution, e.occurred_at
    FROM public.product_analytics_event e
    WHERE e.occurred_at >= p_from - interval '14 days' AND e.occurred_at < p_to
      AND (e.org_id IS NULL OR NOT EXISTS (SELECT 1 FROM evals.prospect_snapshot p WHERE p.org_id = e.org_id))
  ), period AS (SELECT * FROM ev WHERE occurred_at >= p_from),
  accounts AS (
    SELECT DISTINCT ON (org_id) org_id, occurred_at,
      COALESCE(NULLIF(attribution->>'utm_source',''), NULLIF(attribution->>'partner',''), NULLIF(attribution->>'ref',''), metadata->>'acquisition', 'unknown') AS source
    FROM ev WHERE event_name = 'account_created' AND org_id IS NOT NULL ORDER BY org_id, occurred_at
  ), cohort AS (
    -- Accounts whose seven-day activation window closed inside the period.
    SELECT a.org_id, EXISTS (SELECT 1 FROM ev v WHERE v.org_id = a.org_id AND v.event_name = 'report_viewed'
        AND v.occurred_at < a.occurred_at + interval '7 days') AS activated
    FROM accounts a WHERE a.occurred_at >= p_from - interval '7 days' AND a.occurred_at < p_to - interval '7 days'
  ), stages AS (
    SELECT org_id, max(CASE event_name WHEN 'report_viewed' THEN 5 WHEN 'run_finished' THEN 4 WHEN 'run_started' THEN 3
      WHEN 'test_set_ready' THEN 2 WHEN 'evaluation_created' THEN 1 ELSE 0 END) AS stage
    FROM ev WHERE org_id IS NOT NULL GROUP BY org_id
  ), finished AS (SELECT * FROM period WHERE event_name = 'demo_finished')
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'funnel', jsonb_build_object(
      'sessions', (SELECT count(DISTINCT session_id) FROM period WHERE event_name = 'page_view'),
      'page_views', (SELECT count(*) FROM period WHERE event_name = 'page_view'),
      'demo_starts', (SELECT count(*) FROM period WHERE event_name = 'demo_started'),
      'demo_finished', (SELECT count(*) FROM finished),
      'demo_succeeded', (SELECT count(*) FROM finished WHERE metadata->>'outcome' = 'done'),
      'demo_p50_s', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (metadata->>'duration_s')::numeric)
        FROM finished WHERE metadata->>'outcome' = 'done' AND metadata->>'duration_s' ~ '^[0-9]+(\.[0-9]+)?$'),
      'new_accounts', (SELECT count(*) FROM accounts WHERE occurred_at >= p_from),
      'activation_cohort', (SELECT count(*) FROM cohort),
      'activation_activated', (SELECT count(*) FROM cohort WHERE activated),
      'runs_started', (SELECT count(*) FROM period WHERE event_name = 'run_started'),
      'reports_viewed', (SELECT count(*) FROM period WHERE event_name = 'report_viewed'),
      'snapshots_created', (SELECT count(*) FROM evals.prospect_snapshot WHERE created_at >= p_from AND created_at < p_to),
      'snapshots_shared', (SELECT count(*) FROM evals.prospect_snapshot WHERE shared_at >= p_from AND shared_at < p_to),
      'paying_customers', (SELECT count(DISTINCT l.org_id) FROM billing.ledger_entry l WHERE l.entry_type = 'purchase' AND l.created_at < p_to),
      'purchases_recorded', EXISTS (SELECT 1 FROM billing.ledger_entry l WHERE l.entry_type = 'purchase'),
      'credits_sold', (SELECT round(sum(l.amount_ucr) / 1000000.0, 2) FROM billing.ledger_entry l WHERE l.entry_type = 'purchase' AND l.created_at >= p_from AND l.created_at < p_to)),
    'demo_failures', (SELECT coalesce(jsonb_agg(x ORDER BY x.count DESC, x.reason), '[]'::jsonb) FROM (
      SELECT coalesce(nullif(metadata->>'error_code', ''), 'unknown') AS reason, count(*)::int AS count
      FROM finished WHERE metadata->>'outcome' IS DISTINCT FROM 'done' GROUP BY 1) x),
    'demo_queue', (SELECT count(*) FROM demo.run WHERE phase NOT IN ('done','failed')),
    'stuck_runs', (SELECT coalesce(jsonb_agg(x ORDER BY x.since), '[]'::jsonb) FROM (
      SELECT r.org_id AS "orgId", r.id AS "runId", w.name AS workspace, r.status, r.phase, r.updated_at AS since
      FROM evals.run r JOIN evals.workspace w ON w.id = r.org_id
      WHERE w.deleted_at IS NULL AND r.status IN ('queued','running','pause_requested','cancel_requested')
        AND r.updated_at < now() - interval '2 hours'
      ORDER BY r.updated_at LIMIT 20) x),
    'stuck_run_count', (SELECT count(*) FROM evals.run r JOIN evals.workspace w ON w.id = r.org_id
      WHERE w.deleted_at IS NULL AND r.status IN ('queued','running','pause_requested','cancel_requested') AND r.updated_at < now() - interval '2 hours'),
    'old_holds', (SELECT coalesce(jsonb_agg(x ORDER BY x.since), '[]'::jsonb) FROM (
      SELECT h.org_id AS "orgId", w.name AS workspace, count(*)::int AS holds, round(sum(h.amount_ucr) / 1000000.0, 2) AS credits, min(h.created_at) AS since
      FROM billing.credit_hold h JOIN evals.workspace w ON w.id = h.org_id
      WHERE h.state = 'held' AND h.created_at < now() - interval '24 hours' GROUP BY h.org_id, w.name ORDER BY min(h.created_at) LIMIT 20) x),
    'low_balance', (SELECT coalesce(jsonb_agg(x ORDER BY x.credits), '[]'::jsonb) FROM (
      SELECT a.org_id AS "orgId", w.name AS workspace, round(a.available_ucr / 1000000.0, 2) AS credits
      FROM billing.credit_account a JOIN evals.workspace w ON w.id = a.org_id
      WHERE w.deleted_at IS NULL AND a.billing_mode = 'credits' AND a.available_ucr < 500 * 1000000::bigint
      ORDER BY a.available_ucr LIMIT 20) x),
    'signups', (SELECT coalesce(jsonb_agg(x ORDER BY x."createdAt" DESC), '[]'::jsonb) FROM (
      SELECT a.org_id AS "orgId", w.name AS company, a.source, a.occurred_at AS "createdAt",
        (SELECT min(split_part(lower(u.email), '@', 2)) FROM evals.membership m JOIN public.auth_user u ON u.id = m.user_id
          WHERE m.org_id = a.org_id AND m.role = 'owner') AS domain,
        CASE s.stage WHEN 5 THEN 'report_viewed' WHEN 4 THEN 'run_finished' WHEN 3 THEN 'run_started' WHEN 2 THEN 'test_set_ready'
          WHEN 1 THEN 'evaluation_created' ELSE 'account_created' END AS stage
      FROM accounts a JOIN evals.workspace w ON w.id = a.org_id LEFT JOIN stages s ON s.org_id = a.org_id
      WHERE a.occurred_at >= p_from AND w.deleted_at IS NULL ORDER BY a.occurred_at DESC LIMIT 25) x)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION evals.claim_ops_digest(date), evals.finish_ops_digest(date,boolean,text,text,jsonb), evals.ops_digest_data(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.claim_ops_digest(date), evals.finish_ops_digest(date,boolean,text,text,jsonb), evals.ops_digest_data(timestamptz,timestamptz) TO evals_runtime;

COMMIT;
