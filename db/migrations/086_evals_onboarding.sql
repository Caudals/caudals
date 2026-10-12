-- Launch L-06 (spec v2 P-01, P-02, P-04): first-run onboarding and activation.
--
-- Three additive tables:
--
-- * evals.workspace_onboarding: per-workspace onboarding state. `tracked`
--   rows belong to workspaces created through self-serve sign-up (demo or
--   direct) while ONBOARDING_AUTOSTART is on: whether the activation
--   checklist was dismissed, the optional two-question welcome (system type
--   and goal, or skipped) and when a member first opened a published report.
--   Every workspace may also have a row for `example_hidden_at`, the owner's
--   choice to hide the example evaluation (launch L-33) from the workspace's
--   lists; such a row is not tracked, so it shows no checklist or welcome.
--   Members read their workspace's row; platform operators read every row
--   (the ops growth view). Every write goes through
--   evals.start_workspace_onboarding() and evals.update_workspace_onboarding(),
--   which check the caller's membership and role in SQL.
--
-- * evals.onboarding_autostart: the durable intent to prepare an imported
--   demo's full test set automatically. The primary key (workspace,
--   evaluation) makes the intent unique; the application starts at most one
--   generation job from it, under a row lock, with a fixed idempotency key.
--   Tenant RLS like evals.evaluation_restart (migration 079).
--   evals.onboarding_autostart_due() lets the scheduler find the few
--   workspaces with pending intents without scanning all of them.
--
-- * evals.onboarding_help_request: the ops task a customer opens with "Get
--   help" when their site or chat cannot be reached. At most one open request
--   per evaluation. Members see their workspace's requests; operators see and
--   resolve all of them. Writes only through SECURITY DEFINER functions, which
--   also write the audit trail.
--
-- evals.workspace_onboarding_state() returns the checklist facts (connection,
-- reference pages, run, results read, colleague invited) in one call. It is
-- SECURITY DEFINER because membership and invitation rows are not visible to
-- other members under their own RLS policies.
--
-- Forward repair: purely additive. The rollback refuses while any of the
-- three tables holds rows.
BEGIN;

CREATE TABLE evals.workspace_onboarding (
  org_id uuid PRIMARY KEY REFERENCES evals.workspace(id),
  tracked boolean NOT NULL DEFAULT false,
  checklist_dismissed_at timestamptz,
  checklist_dismissed_by text,
  welcome_status text NOT NULL DEFAULT 'pending'
    CONSTRAINT workspace_onboarding_welcome_status CHECK (welcome_status IN ('pending','answered','skipped')),
  system_type text
    CONSTRAINT workspace_onboarding_system_type CHECK (system_type IS NULL OR system_type IN ('website_chat','api_assistant','internal_assistant','agent','other')),
  goal text
    CONSTRAINT workspace_onboarding_goal CHECK (goal IS NULL OR goal IN ('pre_launch','monitor_changes','compare_vendors','ai_review_evidence')),
  welcome_answered_by text,
  welcome_answered_at timestamptz,
  results_read_at timestamptz,
  example_hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evals.workspace_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.workspace_onboarding FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_onboarding_read ON evals.workspace_onboarding FOR SELECT USING (
  (org_id = evals.org_id() AND EXISTS (
    SELECT 1 FROM evals.membership m WHERE m.org_id = workspace_onboarding.org_id AND m.user_id = evals.actor_id()))
  OR evals.is_operator()
);
REVOKE ALL ON evals.workspace_onboarding FROM PUBLIC;
GRANT SELECT ON evals.workspace_onboarding TO evals_runtime;

CREATE TABLE evals.onboarding_autostart (
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  evaluation_id uuid NOT NULL,
  demo_run_id uuid,
  status text NOT NULL DEFAULT 'waiting'
    CONSTRAINT onboarding_autostart_status CHECK (status IN ('waiting','blocked','started','superseded','expired','canceled')),
  reason_code text CONSTRAINT onboarding_autostart_reason CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{1,79}$'),
  locale text NOT NULL DEFAULT 'en' CONSTRAINT onboarding_autostart_locale CHECK (locale IN ('en','es')),
  page_limit integer NOT NULL CONSTRAINT onboarding_autostart_pages CHECK (page_limit BETWEEN 1 AND 25),
  max_cases integer CONSTRAINT onboarding_autostart_cases CHECK (max_cases IS NULL OR max_cases BETWEEN 1 AND 200),
  generation_job_id uuid,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  PRIMARY KEY (org_id, evaluation_id),
  FOREIGN KEY (org_id, evaluation_id) REFERENCES evals.evaluation(org_id, id),
  FOREIGN KEY (org_id, generation_job_id) REFERENCES evals.generation_job(org_id, id)
);
CREATE INDEX onboarding_autostart_pending ON evals.onboarding_autostart (created_at) WHERE status IN ('waiting','blocked');
ALTER TABLE evals.onboarding_autostart ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.onboarding_autostart FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_autostart_tenant ON evals.onboarding_autostart
  USING (org_id = nullif(current_setting('evals.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('evals.org_id', true), '')::uuid);
REVOKE ALL ON evals.onboarding_autostart FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON evals.onboarding_autostart TO evals_runtime;

CREATE TABLE evals.onboarding_help_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  evaluation_id uuid,
  reason_code text NOT NULL CONSTRAINT onboarding_help_reason CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,79}$'),
  status text NOT NULL DEFAULT 'open' CONSTRAINT onboarding_help_status CHECK (status IN ('open','resolved')),
  requested_by text NOT NULL,
  notified_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, evaluation_id) REFERENCES evals.evaluation(org_id, id)
);
-- One open request per evaluation (and one per workspace without an evaluation).
CREATE UNIQUE INDEX onboarding_help_open ON evals.onboarding_help_request
  (org_id, coalesce(evaluation_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'open';
CREATE INDEX onboarding_help_recent ON evals.onboarding_help_request (status, created_at DESC);
ALTER TABLE evals.onboarding_help_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.onboarding_help_request FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_help_read ON evals.onboarding_help_request FOR SELECT USING (
  (org_id = evals.org_id() AND EXISTS (
    SELECT 1 FROM evals.membership m WHERE m.org_id = onboarding_help_request.org_id AND m.user_id = evals.actor_id()))
  OR evals.is_operator()
);
REVOKE ALL ON evals.onboarding_help_request FROM PUBLIC;
GRANT SELECT ON evals.onboarding_help_request TO evals_runtime;

-- Whether the transaction's actor is a member of a live workspace, with one of the roles.
CREATE FUNCTION evals.onboarding_member(p_org uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT EXISTS (
    SELECT 1 FROM evals.membership m JOIN evals.workspace w ON w.id = m.org_id
    WHERE m.org_id = p_org AND m.user_id = evals.actor_id() AND w.deleted_at IS NULL
      AND (p_roles IS NULL OR m.role = ANY (p_roles))
  )
$$;
REVOKE ALL ON FUNCTION evals.onboarding_member(uuid, text[]) FROM PUBLIC;

-- Called in the sign-up transaction, right after enrollment: the new owner
-- starts their workspace's onboarding (checklist on, welcome pending).
CREATE FUNCTION evals.start_workspace_onboarding(p_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF evals.actor_id() IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.onboarding_member(p_org, ARRAY['owner']) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  INSERT INTO evals.workspace_onboarding (org_id, tracked) VALUES (p_org, true)
    ON CONFLICT (org_id) DO UPDATE SET tracked = true, updated_at = now();
END $$;

-- Checklist, welcome and example changes. 'dismiss' and 'restore' need a
-- writer (owner, operator or editor); 'answer' and 'skip' (the welcome) need
-- the owner; these change only tracked rows (workspaces created through
-- self-serve sign-up) and return no row otherwise. 'results_read' is
-- recorded for any member of a tracked workspace and is a no-op for anyone
-- else (an operator reading in support). 'hide_example' and 'show_example'
-- (the example evaluation, launch L-33) need an owner or operator and work in
-- every workspace: they create the workspace's row when it has none.
CREATE FUNCTION evals.update_workspace_onboarding(p_org uuid, p_action text, p_system_type text, p_goal text)
RETURNS SETOF evals.workspace_onboarding LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE
  actor text := evals.actor_id();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF p_action = 'results_read' THEN
    IF NOT evals.onboarding_member(p_org, ARRAY['owner','editor','viewer']) THEN RETURN; END IF;
    RETURN QUERY WITH changed AS (
      UPDATE evals.workspace_onboarding o SET results_read_at = coalesce(o.results_read_at, now()), updated_at = now()
      WHERE o.org_id = p_org AND o.tracked AND o.results_read_at IS NULL RETURNING o.*)
    SELECT * FROM changed;
    RETURN;
  END IF;
  IF p_action IN ('hide_example','show_example') THEN
    IF NOT evals.onboarding_member(p_org, ARRAY['owner','operator']) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
    RETURN QUERY WITH changed AS (
      INSERT INTO evals.workspace_onboarding AS o (org_id, example_hidden_at)
        VALUES (p_org, CASE WHEN p_action = 'hide_example' THEN now() END)
      ON CONFLICT (org_id) DO UPDATE SET
        example_hidden_at = CASE WHEN p_action = 'hide_example' THEN coalesce(o.example_hidden_at, now()) END,
        updated_at = now()
      RETURNING o.*)
    SELECT * FROM changed;
    INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
      VALUES (p_org, actor, CASE WHEN p_action = 'hide_example' THEN 'workspace.example_hidden' ELSE 'workspace.example_shown' END, p_org::text, NULL);
    RETURN;
  END IF;
  IF p_action IN ('dismiss','restore') THEN
    IF NOT evals.onboarding_member(p_org, ARRAY['owner','operator','editor']) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  ELSIF p_action IN ('answer','skip') THEN
    IF NOT evals.onboarding_member(p_org, ARRAY['owner']) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
    IF p_action = 'answer' AND p_system_type IS NULL AND p_goal IS NULL THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  ELSE
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  RETURN QUERY WITH changed AS (UPDATE evals.workspace_onboarding o SET
      checklist_dismissed_at = CASE p_action WHEN 'dismiss' THEN coalesce(o.checklist_dismissed_at, now()) WHEN 'restore' THEN NULL ELSE o.checklist_dismissed_at END,
      checklist_dismissed_by = CASE p_action WHEN 'dismiss' THEN coalesce(o.checklist_dismissed_by, actor) WHEN 'restore' THEN NULL ELSE o.checklist_dismissed_by END,
      welcome_status = CASE p_action WHEN 'answer' THEN 'answered' WHEN 'skip' THEN CASE WHEN o.welcome_status = 'answered' THEN 'answered' ELSE 'skipped' END ELSE o.welcome_status END,
      system_type = CASE WHEN p_action = 'answer' THEN p_system_type ELSE o.system_type END,
      goal = CASE WHEN p_action = 'answer' THEN p_goal ELSE o.goal END,
      welcome_answered_by = CASE WHEN p_action IN ('answer','skip') THEN actor ELSE o.welcome_answered_by END,
      welcome_answered_at = CASE WHEN p_action IN ('answer','skip') THEN now() ELSE o.welcome_answered_at END,
      updated_at = now()
    WHERE o.org_id = p_org AND o.tracked RETURNING o.*)
  SELECT * FROM changed;
  IF FOUND AND p_action IN ('dismiss','restore','answer','skip') THEN
    INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
      VALUES (p_org, actor, 'workspace.onboarding_' || p_action, p_org::text, NULL);
  END IF;
END $$;

-- The checklist facts for one workspace, for its members and operators.
CREATE FUNCTION evals.workspace_onboarding_state(p_org uuid)
RETURNS TABLE (
  tracked boolean, dismissed boolean, welcome_status text, system_type text, goal text, example_hidden boolean,
  has_connection boolean, has_sources boolean, has_run boolean, results_read boolean, has_colleague boolean,
  first_evaluation_id uuid
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
BEGIN
  IF evals.actor_id() IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.onboarding_member(p_org, NULL) AND NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  RETURN QUERY
  WITH o AS (SELECT * FROM evals.workspace_onboarding x WHERE x.org_id = p_org),
  ran AS (SELECT EXISTS (SELECT 1 FROM evals.run r WHERE r.org_id = p_org) AS yes)
  SELECT
    coalesce((SELECT o.tracked FROM o), false),
    coalesce((SELECT o.checklist_dismissed_at IS NOT NULL FROM o), false),
    (SELECT o.welcome_status FROM o),
    (SELECT o.system_type FROM o),
    (SELECT o.goal FROM o),
    coalesce((SELECT o.example_hidden_at IS NOT NULL FROM o), false),
    -- A system whose latest check passed, or one that has already been run against.
    (SELECT ran.yes FROM ran) OR EXISTS (
      SELECT 1 FROM evals.target t
      JOIN LATERAL (SELECT tr.id FROM evals.target_revision tr WHERE tr.org_id = t.org_id AND tr.target_id = t.id
        ORDER BY tr.created_at DESC, tr.id DESC LIMIT 1) tr ON true
      JOIN LATERAL (SELECT c.status FROM evals.connection_check c WHERE c.org_id = t.org_id AND c.target_revision_id = tr.id
        ORDER BY c.created_at DESC, c.id DESC LIMIT 1) c ON true
      WHERE t.org_id = p_org AND t.archived_at IS NULL AND c.status = 'ready'),
    EXISTS (SELECT 1 FROM evals.source_revision sr JOIN evals.source s ON (s.org_id, s.id) = (sr.org_id, sr.source_id)
      WHERE sr.org_id = p_org AND s.archived_at IS NULL),
    (SELECT ran.yes FROM ran),
    CASE WHEN coalesce((SELECT o.tracked FROM o), false) THEN (SELECT o.results_read_at IS NOT NULL FROM o)
      ELSE EXISTS (SELECT 1 FROM evals.report rp WHERE rp.org_id = p_org AND rp.publication_status = 'published' AND rp.archived_at IS NULL) END,
    (SELECT count(*) FROM evals.membership m WHERE m.org_id = p_org AND m.role <> 'operator') > 1
      OR EXISTS (SELECT 1 FROM evals.invitation i WHERE i.org_id = p_org AND i.revoked_at IS NULL
        AND (i.accepted_at IS NOT NULL OR i.expires_at > now())),
    coalesce(
      (SELECT a.evaluation_id FROM evals.onboarding_autostart a JOIN evals.evaluation e ON (e.org_id, e.id) = (a.org_id, a.evaluation_id)
        WHERE a.org_id = p_org AND e.archived_at IS NULL ORDER BY a.created_at DESC LIMIT 1),
      (SELECT e.id FROM evals.evaluation e WHERE e.org_id = p_org AND e.archived_at IS NULL ORDER BY e.created_at, e.id LIMIT 1));
END $$;

-- Workspaces with an automatic start still waiting, for the scheduler's
-- short tick (live workspaces only, oldest first).
CREATE FUNCTION evals.onboarding_autostart_due()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT a.org_id FROM evals.onboarding_autostart a JOIN evals.workspace w ON w.id = a.org_id
  WHERE a.status IN ('waiting','blocked') AND a.created_at > now() - interval '2 days' AND w.deleted_at IS NULL
  GROUP BY a.org_id ORDER BY min(a.created_at) LIMIT 50
$$;

-- "Get help": opens (or returns the open) ops task for an evaluation.
CREATE FUNCTION evals.request_onboarding_help(p_org uuid, p_evaluation uuid, p_reason text)
RETURNS TABLE (id uuid, created boolean, notified boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE
  actor text := evals.actor_id();
  request_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.onboarding_member(p_org, NULL) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{1,79}$' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF p_evaluation IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM evals.evaluation e WHERE e.org_id = p_org AND e.id = p_evaluation AND e.archived_at IS NULL) THEN
    RAISE EXCEPTION 'SCOPE_DENIED';
  END IF;
  -- Serialise requests for one evaluation so a double click opens one task.
  PERFORM pg_advisory_xact_lock(hashtextextended('caudals-onboarding-help:' || p_org::text || ':' || coalesce(p_evaluation::text, ''), 0));
  SELECT h.id INTO request_id FROM evals.onboarding_help_request h
    WHERE h.org_id = p_org AND h.evaluation_id IS NOT DISTINCT FROM p_evaluation AND h.status = 'open';
  IF request_id IS NOT NULL THEN
    RETURN QUERY SELECT h.id, false, h.notified_at IS NOT NULL FROM evals.onboarding_help_request h WHERE h.id = request_id;
    RETURN;
  END IF;
  INSERT INTO evals.onboarding_help_request (org_id, evaluation_id, reason_code, requested_by)
    VALUES (p_org, p_evaluation, p_reason, actor) RETURNING onboarding_help_request.id INTO request_id;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org, actor, 'workspace.help_requested', request_id::text, jsonb_build_object('reason', p_reason, 'evaluation_id', p_evaluation));
  RETURN QUERY SELECT request_id, true, false;
END $$;

-- Records that the operators were notified about a request.
CREATE FUNCTION evals.mark_onboarding_help_notified(p_org uuid, p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF NOT evals.onboarding_member(p_org, NULL) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  UPDATE evals.onboarding_help_request SET notified_at = coalesce(notified_at, now()), updated_at = now()
    WHERE org_id = p_org AND id = p_request;
END $$;

-- An operator closes a request.
CREATE FUNCTION evals.resolve_onboarding_help(p_request uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  request_org uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  UPDATE evals.onboarding_help_request SET status = 'resolved', resolved_at = now(), resolved_by = actor, updated_at = now()
    WHERE id = p_request AND status = 'open' RETURNING org_id INTO request_org;
  IF request_org IS NULL THEN RETURN false; END IF;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (request_org, actor, 'workspace.help_resolved', p_request::text, NULL);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION evals.start_workspace_onboarding(uuid), evals.update_workspace_onboarding(uuid, text, text, text),
  evals.workspace_onboarding_state(uuid), evals.onboarding_autostart_due(), evals.request_onboarding_help(uuid, uuid, text),
  evals.mark_onboarding_help_notified(uuid, uuid), evals.resolve_onboarding_help(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.start_workspace_onboarding(uuid), evals.update_workspace_onboarding(uuid, text, text, text),
  evals.workspace_onboarding_state(uuid), evals.onboarding_autostart_due(), evals.request_onboarding_help(uuid, uuid, text),
  evals.mark_onboarding_help_notified(uuid, uuid), evals.resolve_onboarding_help(uuid) TO evals_runtime;

COMMIT;
