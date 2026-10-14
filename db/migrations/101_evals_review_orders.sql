-- Launch L-26 (spec v2 P-10, P-32, P-33): expert review, from a customer's
-- request on a report to a reviewed report revision.
--
-- Five additive tables:
--
-- * evals.review_request: "Have an expert review this" from a report or its
--   evaluation's results. The customer's scope, deadline and sector, the reply
--   SLA (one working day, Europe/Madrid, weekends skipped) and the status the
--   customer sees. At most one open request per report. Members of the
--   workspace and platform operators read it; every write goes through the
--   SECURITY DEFINER functions below, which also write the audit trail.
--
-- * evals.review_crm_draft: the Warmbly CRM handoff draft written with each
--   request. Never sent (`sent` is false and `destination` is warmbly, both
--   checked); an operator copies it into Warmbly. Immutable, operators only.
--   It is separate from evals.crm_handoff_draft, which allows one draft per
--   report revision and is used by growth accounts and prospect snapshots.
--
-- * evals.review_order: what ops agreed with the customer: scope, sector, due
--   date and a hand-written quote. A quote is a note for invoicing by hand:
--   nothing here touches the credit ledger (spec §6.17: credits never pay for
--   expert hours). Operators only; customers see the request's status and due
--   date, experts see neither.
--
-- * evals.review_order_assignment: links an order to the Stage E assignments
--   it created (migration 043). Operators only and immutable, so an expert
--   never learns which order, customer or report an assignment belongs to.
--
-- * evals.expert_onboarding: the bench checklist (P-33): credentials, a
--   contract with IP assignment and confidentiality, the DPA, a paid trial
--   against gold items and its agreement threshold, sectors (the roster),
--   availability and manual payment of the trial. Operators only. Order work
--   goes only to experts whose checklist is complete (evals.expert_ready).
--
-- A trigger on evals.report_revision enforces decision I-7: a snapshot that
-- carries an `expert_review` label must name an order of the same report with
-- at least as many recorded reviewers (distinct experts who submitted work on
-- its assignments) as the label says, and never fewer than one.
--
-- Forward repair: purely additive. The rollback refuses while any of the five
-- tables holds rows.
BEGIN;

CREATE TABLE evals.review_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  report_id uuid NOT NULL,
  report_revision_id uuid NOT NULL,
  surface text NOT NULL CONSTRAINT review_request_surface CHECK (surface IN ('report', 'results')),
  scope_kind text NOT NULL CONSTRAINT review_request_scope CHECK (scope_kind IN ('failed_answers', 'whole_report', 'findings', 'pilot')),
  scope_note text CONSTRAINT review_request_note CHECK (scope_note IS NULL OR length(scope_note) BETWEEN 1 AND 1000),
  deadline date,
  sector text NOT NULL CONSTRAINT review_request_sector CHECK (sector ~ '^[a-z][a-z_]{1,39}$'),
  locale text NOT NULL CONSTRAINT review_request_locale CHECK (locale IN ('en', 'es')),
  status text NOT NULL DEFAULT 'requested' CONSTRAINT review_request_status CHECK (status IN ('requested', 'quoted', 'ordered', 'delivered', 'declined')),
  requested_by text NOT NULL,
  reply_due_at timestamptz NOT NULL,
  notified_at timestamptz,
  replied_at timestamptz,
  due_at timestamptz,
  delivered_revision_id uuid,
  delivered_at timestamptz,
  closed_at timestamptz,
  closed_by text,
  close_reason text CONSTRAINT review_request_close_reason CHECK (close_reason IS NULL OR length(close_reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, report_id) REFERENCES evals.report(org_id, id),
  FOREIGN KEY (org_id, report_revision_id) REFERENCES evals.report_revision(org_id, id),
  FOREIGN KEY (org_id, delivered_revision_id) REFERENCES evals.report_revision(org_id, id)
);
-- One open request per report: a double click or a second visit returns it.
CREATE UNIQUE INDEX review_request_open ON evals.review_request (org_id, report_id)
  WHERE status IN ('requested', 'quoted', 'ordered');
CREATE INDEX review_request_recent ON evals.review_request (status, created_at DESC);

CREATE TABLE evals.review_crm_draft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  request_id uuid NOT NULL,
  summary jsonb NOT NULL CONSTRAINT review_crm_draft_unsent CHECK (
    jsonb_typeof(summary) = 'object' AND summary -> 'sent' = 'false'::jsonb AND summary ->> 'destination' = 'warmbly'
  ),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, request_id),
  FOREIGN KEY (org_id, request_id) REFERENCES evals.review_request(org_id, id)
);

CREATE TABLE evals.review_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  request_id uuid NOT NULL,
  report_id uuid NOT NULL,
  project_id uuid NOT NULL,
  scope text NOT NULL CONSTRAINT review_order_scope CHECK (length(scope) BETWEEN 3 AND 300),
  sector text NOT NULL CONSTRAINT review_order_sector CHECK (sector ~ '^[a-z][a-z_]{1,39}$'),
  due_at timestamptz NOT NULL,
  quote_amount numeric(12, 2) NOT NULL CONSTRAINT review_order_quote CHECK (quote_amount >= 0),
  quote_currency text NOT NULL DEFAULT 'EUR' CONSTRAINT review_order_currency CHECK (quote_currency ~ '^[A-Z]{3}$'),
  quote_note text NOT NULL CONSTRAINT review_order_quote_note CHECK (length(quote_note) BETWEEN 1 AND 4000),
  guideline_revision_id uuid NOT NULL,
  source_revision_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CONSTRAINT review_order_status CHECK (status IN ('open', 'delivered', 'canceled')),
  result_revision_id uuid,
  reviewer_count integer CONSTRAINT review_order_reviewers CHECK (reviewer_count IS NULL OR reviewer_count >= 1),
  delivered_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text CONSTRAINT review_order_cancel_reason CHECK (cancel_reason IS NULL OR length(cancel_reason) BETWEEN 1 AND 500),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, request_id),
  FOREIGN KEY (org_id, request_id) REFERENCES evals.review_request(org_id, id),
  FOREIGN KEY (org_id, report_id) REFERENCES evals.report(org_id, id),
  FOREIGN KEY (org_id, project_id) REFERENCES evals.project(org_id, id),
  FOREIGN KEY (org_id, guideline_revision_id) REFERENCES evals.expert_guideline_revision(org_id, id),
  FOREIGN KEY (org_id, source_revision_id) REFERENCES evals.report_revision(org_id, id),
  FOREIGN KEY (org_id, result_revision_id) REFERENCES evals.report_revision(org_id, id),
  CONSTRAINT review_order_delivery CHECK (
    (status = 'delivered') = (result_revision_id IS NOT NULL AND reviewer_count IS NOT NULL AND delivered_at IS NOT NULL)
  )
);
CREATE INDEX review_order_open ON evals.review_order (status, due_at);

CREATE TABLE evals.review_order_assignment (
  org_id uuid NOT NULL,
  order_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  expert_profile_id uuid NOT NULL REFERENCES evals.expert_profile(id),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, assignment_id),
  FOREIGN KEY (org_id, order_id) REFERENCES evals.review_order(org_id, id),
  FOREIGN KEY (org_id, assignment_id) REFERENCES evals.expert_assignment(org_id, id)
);
CREATE INDEX review_order_assignment_order ON evals.review_order_assignment (org_id, order_id);

CREATE TABLE evals.expert_onboarding (
  expert_profile_id uuid PRIMARY KEY REFERENCES evals.expert_profile(id),
  credentials_verified_at timestamptz,
  contract_signed_at timestamptz,
  ip_assignment boolean NOT NULL DEFAULT false,
  confidentiality boolean NOT NULL DEFAULT false,
  dpa_signed_at timestamptz,
  trial_gold_items integer CONSTRAINT expert_onboarding_trial_items CHECK (trial_gold_items IS NULL OR trial_gold_items BETWEEN 0 AND 10000),
  trial_agreement numeric(5, 4) CONSTRAINT expert_onboarding_agreement CHECK (trial_agreement IS NULL OR trial_agreement BETWEEN 0 AND 1),
  agreement_threshold numeric(5, 4) NOT NULL DEFAULT 0.8 CONSTRAINT expert_onboarding_threshold CHECK (agreement_threshold BETWEEN 0.5 AND 1),
  trial_completed_at timestamptz,
  trial_paid_at timestamptz,
  sectors text[] NOT NULL DEFAULT ARRAY[]::text[] CONSTRAINT expert_onboarding_sectors CHECK (
    cardinality(sectors) <= 12 AND array_to_string(sectors, ',') ~ '^([a-z][a-z_]{1,39}(,[a-z][a-z_]{1,39})*)?$'
  ),
  availability text NOT NULL DEFAULT 'unavailable' CONSTRAINT expert_onboarding_availability CHECK (availability IN ('available', 'limited', 'unavailable')),
  hours_per_week integer CONSTRAINT expert_onboarding_hours CHECK (hours_per_week IS NULL OR hours_per_week BETWEEN 0 AND 60),
  notes text CONSTRAINT expert_onboarding_notes CHECK (notes IS NULL OR length(notes) <= 2000),
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expert_onboarding_trial CHECK (trial_completed_at IS NULL OR (trial_gold_items IS NOT NULL AND trial_agreement IS NOT NULL))
);

-- Row-level security: members read their workspace's requests; operators
-- read everything; experts and other customers read nothing.
ALTER TABLE evals.review_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.review_request FORCE ROW LEVEL SECURITY;
CREATE POLICY review_request_read ON evals.review_request FOR SELECT USING (
  (org_id = evals.org_id() AND EXISTS (
    SELECT 1 FROM evals.membership m WHERE m.org_id = review_request.org_id AND m.user_id = evals.actor_id()))
  OR evals.is_operator()
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['review_crm_draft', 'review_order', 'review_order_assignment', 'expert_onboarding'] LOOP
    EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON evals.%I FOR SELECT USING (evals.is_operator())', t || '_staff_read', t);
  END LOOP;
END $$;
REVOKE ALL ON evals.review_request, evals.review_crm_draft, evals.review_order,
  evals.review_order_assignment, evals.expert_onboarding FROM PUBLIC;
GRANT SELECT ON evals.review_request, evals.review_crm_draft, evals.review_order,
  evals.review_order_assignment, evals.expert_onboarding TO evals_runtime;

CREATE TRIGGER review_crm_draft_immutable BEFORE UPDATE OR DELETE ON evals.review_crm_draft
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER review_order_assignment_immutable BEFORE UPDATE OR DELETE ON evals.review_order_assignment
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();

-- The next working day at the same Madrid wall-clock time (Saturday and
-- Sunday skipped; public holidays are not modelled).
CREATE FUNCTION evals.next_working_day(p_from timestamptz)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE local timestamp := (p_from AT TIME ZONE 'Europe/Madrid') + interval '1 day';
BEGIN
  WHILE extract(isodow FROM local) IN (6, 7) LOOP
    local := local + interval '1 day';
  END LOOP;
  RETURN local AT TIME ZONE 'Europe/Madrid';
END $$;

-- Distinct experts who submitted their own work on an order's assignments
-- (rejected, canceled, superseded and unfinished work does not count).
CREATE FUNCTION evals.review_order_recorded_reviewers(p_org uuid, p_order uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT count(DISTINCT a.assigned_profile_id)::int
  FROM evals.review_order_assignment link
  JOIN evals.expert_assignment a ON (a.org_id, a.id) = (link.org_id, link.assignment_id)
  WHERE link.org_id = p_org AND link.order_id = p_order
    AND a.status IN ('submitted', 'in_review', 'approved', 'adjudicated')
    AND EXISTS (
      SELECT 1 FROM evals.expert_submission_revision s
      WHERE (s.org_id, s.id) = (a.org_id, a.current_submission_revision_id)
        AND s.status = 'submitted' AND s.author_profile_id = a.assigned_profile_id)
$$;

-- Whether an expert may take order work: an eligible, verified profile with
-- accepted terms and a complete onboarding checklist that passed its trial.
CREATE FUNCTION evals.expert_ready(p_profile uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT EXISTS (
    SELECT 1 FROM evals.expert_profile p JOIN evals.expert_onboarding o ON o.expert_profile_id = p.id
    WHERE p.id = p_profile AND p.credentials_status = 'verified' AND p.terms_status = 'accepted'
      AND p.eligibility_status = 'eligible'
      AND o.credentials_verified_at IS NOT NULL AND o.contract_signed_at IS NOT NULL
      AND o.ip_assignment AND o.confidentiality AND o.dpa_signed_at IS NOT NULL
      AND o.trial_completed_at IS NOT NULL AND o.trial_agreement >= o.agreement_threshold
      AND o.availability <> 'unavailable')
$$;

-- Decision I-7, enforced in the database: an expert-review label needs recorded reviewers.
CREATE FUNCTION evals.guard_expert_review_label()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  label jsonb := NEW.snapshot -> 'expert_review';
  order_row evals.review_order%ROWTYPE;
  claimed integer;
BEGIN
  IF label IS NULL OR jsonb_typeof(label) = 'null' THEN RETURN NEW; END IF;
  IF jsonb_typeof(label) <> 'object' OR coalesce(label ->> 'order_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(label ->> 'reviewer_count', '') !~ '^[0-9]{1,4}$' THEN
    RAISE EXCEPTION 'EXPERT_REVIEW_UNRECORDED';
  END IF;
  claimed := (label ->> 'reviewer_count')::integer;
  SELECT * INTO order_row FROM evals.review_order o
    WHERE o.org_id = NEW.org_id AND o.id = (label ->> 'order_id')::uuid AND o.report_id = NEW.report_id AND o.status <> 'canceled';
  IF order_row.id IS NULL OR claimed < 1 OR evals.review_order_recorded_reviewers(NEW.org_id, order_row.id) < claimed THEN
    RAISE EXCEPTION 'EXPERT_REVIEW_UNRECORDED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_revision_expert_review_guard BEFORE INSERT ON evals.report_revision
  FOR EACH ROW EXECUTE FUNCTION evals.guard_expert_review_label();

-- "Have an expert review this": opens (or returns the open) request for a
-- published report, with its CRM draft. Owners and workspace operators only.
CREATE FUNCTION evals.request_expert_review(
  p_org uuid, p_report uuid, p_surface text, p_scope_kind text, p_scope_note text,
  p_deadline date, p_sector text, p_locale text, p_crm jsonb)
RETURNS TABLE (id uuid, created boolean, notified boolean, status text, reply_due_at timestamptz, due_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE
  actor text := evals.actor_id();
  revision uuid;
  request_id uuid;
  draft_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM evals.membership m JOIN evals.workspace w ON w.id = m.org_id
    WHERE m.org_id = p_org AND m.user_id = actor AND w.deleted_at IS NULL AND m.role IN ('owner', 'operator')) THEN
    RAISE EXCEPTION 'SCOPE_DENIED';
  END IF;
  IF p_surface NOT IN ('report', 'results') OR p_scope_kind NOT IN ('failed_answers', 'whole_report', 'findings', 'pilot')
    OR p_sector IS NULL OR p_sector !~ '^[a-z][a-z_]{1,39}$' OR p_locale NOT IN ('en', 'es')
    OR (p_scope_note IS NOT NULL AND length(p_scope_note) NOT BETWEEN 1 AND 1000)
    OR (p_deadline IS NOT NULL AND (p_deadline < (now() AT TIME ZONE 'Europe/Madrid')::date OR p_deadline > (now() AT TIME ZONE 'Europe/Madrid')::date + 366))
    OR p_crm IS NULL OR jsonb_typeof(p_crm) <> 'object' THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  SELECT r.current_revision_id INTO revision FROM evals.report r
    WHERE r.org_id = p_org AND r.id = p_report AND r.publication_status = 'published' AND r.current_revision_id IS NOT NULL;
  IF revision IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  -- Serialise requests for one report so a double click opens one request.
  PERFORM pg_advisory_xact_lock(hashtextextended('caudals-review-request:' || p_org::text || ':' || p_report::text, 0));
  SELECT q.id INTO request_id FROM evals.review_request q
    WHERE q.org_id = p_org AND q.report_id = p_report AND q.status IN ('requested', 'quoted', 'ordered');
  IF request_id IS NOT NULL THEN
    RETURN QUERY SELECT q.id, false, q.notified_at IS NOT NULL, q.status, q.reply_due_at, q.due_at, q.created_at
      FROM evals.review_request q WHERE q.id = request_id;
    RETURN;
  END IF;
  INSERT INTO evals.review_request (org_id, report_id, report_revision_id, surface, scope_kind, scope_note, deadline, sector, locale, requested_by, reply_due_at)
    VALUES (p_org, p_report, revision, p_surface, p_scope_kind, p_scope_note, p_deadline, p_sector, p_locale, actor, evals.next_working_day(now()))
    RETURNING review_request.id INTO request_id;
  INSERT INTO evals.review_crm_draft (org_id, request_id, summary, created_by)
    VALUES (p_org, request_id, p_crm || jsonb_build_object('kind', 'expert_review_request', 'destination', 'warmbly', 'sent', false, 'request_id', request_id), actor)
    RETURNING review_crm_draft.id INTO draft_id;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org, actor, 'review_request.created', request_id::text,
      jsonb_build_object('report_id', p_report, 'surface', p_surface, 'scope_kind', p_scope_kind, 'sector', p_sector));
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org, actor, 'crm_handoff_draft.created', draft_id::text, jsonb_build_object('kind', 'expert_review_request', 'sent', false));
  RETURN QUERY SELECT q.id, true, false, q.status, q.reply_due_at, q.due_at, q.created_at FROM evals.review_request q WHERE q.id = request_id;
END $$;

-- Records that the founders were emailed about a request.
CREATE FUNCTION evals.mark_review_request_notified(p_org uuid, p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM evals.membership m WHERE m.org_id = p_org AND m.user_id = evals.actor_id()) AND NOT evals.is_operator() THEN
    RAISE EXCEPTION 'SCOPE_DENIED';
  END IF;
  UPDATE evals.review_request SET notified_at = coalesce(notified_at, now()), updated_at = now()
    WHERE org_id = p_org AND id = p_request;
END $$;

-- Ops: record the hand-written reply (quote sent) or decline a request.
CREATE FUNCTION evals.update_review_request(p_request uuid, p_action text, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  row_org uuid;
  next_status text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_action NOT IN ('quoted', 'declined') OR (p_reason IS NOT NULL AND length(p_reason) NOT BETWEEN 1 AND 500)
    OR (p_action = 'declined' AND p_reason IS NULL) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  IF p_action = 'quoted' THEN
    UPDATE evals.review_request SET status = 'quoted', replied_at = coalesce(replied_at, now()), updated_at = now()
      WHERE id = p_request AND status IN ('requested', 'quoted') RETURNING org_id, status INTO row_org, next_status;
  ELSE
    UPDATE evals.review_request SET status = 'declined', replied_at = coalesce(replied_at, now()), closed_at = now(),
        closed_by = actor, close_reason = p_reason, updated_at = now()
      WHERE id = p_request AND status IN ('requested', 'quoted') RETURNING org_id, status INTO row_org, next_status;
  END IF;
  IF row_org IS NULL THEN RAISE EXCEPTION 'REVIEW_STATE'; END IF;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (row_org, actor, 'review_request.' || p_action, p_request::text, NULL);
  RETURN next_status;
END $$;

-- Ops: turn a request into an order. Runs in the request's tenant context,
-- after the guideline revision for the order was written in the same transaction.
CREATE FUNCTION evals.create_review_order(
  p_request uuid, p_scope text, p_sector text, p_due_at timestamptz,
  p_quote_amount numeric, p_quote_currency text, p_quote_note text, p_guideline uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  scoped uuid := evals.org_id();
  request evals.review_request%ROWTYPE;
  report_row evals.report%ROWTYPE;
  order_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  SELECT * INTO request FROM evals.review_request WHERE id = p_request AND org_id = scoped FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF request.status NOT IN ('requested', 'quoted') THEN RAISE EXCEPTION 'REVIEW_STATE'; END IF;
  IF p_scope IS NULL OR length(p_scope) NOT BETWEEN 3 AND 300 OR p_sector IS NULL OR p_sector !~ '^[a-z][a-z_]{1,39}$'
    OR p_due_at IS NULL OR p_due_at <= now() OR p_due_at > now() + interval '366 days'
    OR p_quote_amount IS NULL OR p_quote_amount < 0 OR p_quote_currency !~ '^[A-Z]{3}$'
    OR p_quote_note IS NULL OR length(p_quote_note) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  SELECT * INTO report_row FROM evals.report WHERE org_id = scoped AND id = request.report_id
    AND publication_status = 'published' AND current_revision_id IS NOT NULL;
  IF report_row.id IS NULL THEN RAISE EXCEPTION 'REVIEW_STATE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.expert_guideline_revision g
    WHERE g.org_id = scoped AND g.id = p_guideline AND g.project_id = report_row.project_id) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  INSERT INTO evals.review_order (org_id, request_id, report_id, project_id, scope, sector, due_at, quote_amount,
      quote_currency, quote_note, guideline_revision_id, source_revision_id, created_by)
    VALUES (scoped, request.id, report_row.id, report_row.project_id, p_scope, p_sector, p_due_at, p_quote_amount,
      p_quote_currency, p_quote_note, p_guideline, report_row.current_revision_id, actor)
    RETURNING id INTO order_id;
  UPDATE evals.review_request SET status = 'ordered', replied_at = coalesce(replied_at, now()), due_at = p_due_at, updated_at = now()
    WHERE id = request.id;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (scoped, actor, 'review_order.created', order_id::text,
      jsonb_build_object('request_id', request.id, 'due_at', p_due_at, 'quote_currency', p_quote_currency));
  RETURN order_id;
END $$;

-- Ops: link a freshly created Stage E assignment to its order. The expert
-- must be ready (evals.expert_ready) and the work must use the order's guideline.
CREATE FUNCTION evals.link_review_order_assignment(p_order uuid, p_assignment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  scoped uuid := evals.org_id();
  order_row evals.review_order%ROWTYPE;
  assignment evals.expert_assignment%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  SELECT * INTO order_row FROM evals.review_order WHERE org_id = scoped AND id = p_order FOR UPDATE;
  IF order_row.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF order_row.status <> 'open' THEN RAISE EXCEPTION 'REVIEW_STATE'; END IF;
  SELECT * INTO assignment FROM evals.expert_assignment WHERE org_id = scoped AND id = p_assignment;
  IF assignment.id IS NULL OR assignment.project_id <> order_row.project_id
    OR assignment.guideline_revision_id <> order_row.guideline_revision_id OR assignment.kind <> 'authoring' THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  IF NOT evals.expert_ready(assignment.assigned_profile_id) THEN RAISE EXCEPTION 'EXPERT_NOT_READY'; END IF;
  IF EXISTS (SELECT 1 FROM evals.review_order_assignment l
    WHERE l.org_id = scoped AND l.order_id = p_order AND l.expert_profile_id = assignment.assigned_profile_id) THEN
    RAISE EXCEPTION 'INPUT_INVALID';
  END IF;
  INSERT INTO evals.review_order_assignment (org_id, order_id, assignment_id, expert_profile_id, created_by)
    VALUES (scoped, p_order, p_assignment, assignment.assigned_profile_id, actor);
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (scoped, actor, 'review_order.assignment_linked', p_order::text, jsonb_build_object('assignment_id', p_assignment));
END $$;

-- Ops: how many experts have submitted work on an order, out of how many assignments.
CREATE FUNCTION evals.review_order_progress(p_order uuid)
RETURNS TABLE (reviewer_count integer, assignment_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE row_org uuid;
BEGIN
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  SELECT o.org_id INTO row_org FROM evals.review_order o WHERE o.id = p_order;
  IF row_org IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  RETURN QUERY SELECT evals.review_order_recorded_reviewers(row_org, p_order),
    (SELECT count(*)::int FROM evals.review_order_assignment l WHERE l.org_id = row_org AND l.order_id = p_order);
END $$;

-- Ops: the reviewed revision is in place (inserted and published in the same
-- transaction); close the order and the request and record the time to review.
CREATE FUNCTION evals.complete_review_order(p_order uuid, p_revision uuid)
RETURNS TABLE (reviewer_count integer, delivered_at timestamptz, requested_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
#variable_conflict use_column
DECLARE
  actor text := evals.actor_id();
  scoped uuid := evals.org_id();
  order_row evals.review_order%ROWTYPE;
  label jsonb;
  claimed integer;
  requested timestamptz;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  SELECT * INTO order_row FROM evals.review_order o WHERE o.org_id = scoped AND o.id = p_order FOR UPDATE;
  IF order_row.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF order_row.status <> 'open' THEN RAISE EXCEPTION 'REVIEW_STATE'; END IF;
  SELECT rr.snapshot -> 'expert_review' INTO label FROM evals.report_revision rr
    JOIN evals.report r ON (r.org_id, r.id) = (rr.org_id, rr.report_id)
    WHERE rr.org_id = scoped AND rr.id = p_revision AND rr.report_id = order_row.report_id
      AND r.current_revision_id = rr.id AND r.publication_status = 'published';
  IF label IS NULL OR label ->> 'order_id' IS DISTINCT FROM p_order::text THEN RAISE EXCEPTION 'EXPERT_REVIEW_UNRECORDED'; END IF;
  claimed := (label ->> 'reviewer_count')::integer;
  IF claimed < 1 OR evals.review_order_recorded_reviewers(scoped, p_order) < claimed THEN RAISE EXCEPTION 'EXPERT_REVIEW_UNRECORDED'; END IF;
  UPDATE evals.review_order SET status = 'delivered', result_revision_id = p_revision, reviewer_count = claimed,
      delivered_at = now(), updated_at = now()
    WHERE id = p_order;
  UPDATE evals.review_request SET status = 'delivered', delivered_revision_id = p_revision, delivered_at = now(), updated_at = now()
    WHERE org_id = scoped AND id = order_row.request_id RETURNING created_at INTO requested;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (scoped, actor, 'review_order.delivered', p_order::text, jsonb_build_object(
      'report_revision_id', p_revision, 'reviewer_count', claimed,
      'hours_to_review', round(extract(epoch FROM now() - requested) / 3600.0, 1)));
  RETURN QUERY SELECT claimed, now(), requested;
END $$;

-- Ops: cancel an open order. Unfinished assignments are canceled with it and
-- the request is closed as declined; submitted work stays as it is.
CREATE FUNCTION evals.cancel_review_order(p_order uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  scoped uuid := evals.org_id();
  order_row evals.review_order%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  SELECT * INTO order_row FROM evals.review_order o WHERE o.org_id = scoped AND o.id = p_order FOR UPDATE;
  IF order_row.id IS NULL THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF order_row.status <> 'open' THEN RAISE EXCEPTION 'REVIEW_STATE'; END IF;
  UPDATE evals.review_order SET status = 'canceled', canceled_at = now(), cancel_reason = p_reason, updated_at = now() WHERE id = p_order;
  UPDATE evals.expert_assignment a SET status = 'canceled', updated_at = now()
    FROM evals.review_order_assignment l
    WHERE l.org_id = scoped AND l.order_id = p_order AND (a.org_id, a.id) = (l.org_id, l.assignment_id)
      AND a.status IN ('assigned', 'in_progress', 'conflict', 'guideline_changed', 'changes_requested');
  UPDATE evals.review_request SET status = 'declined', closed_at = now(), closed_by = actor, close_reason = p_reason, updated_at = now()
    WHERE org_id = scoped AND id = order_row.request_id;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (scoped, actor, 'review_order.canceled', p_order::text, NULL);
END $$;

-- Ops: save an expert's onboarding checklist (P-33).
CREATE FUNCTION evals.save_expert_onboarding(p_profile uuid, p_checklist jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  profile_org uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.is_operator() THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_checklist IS NULL OR jsonb_typeof(p_checklist) <> 'object' THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM evals.expert_profile WHERE id = p_profile) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  INSERT INTO evals.expert_onboarding AS o (expert_profile_id, credentials_verified_at, contract_signed_at, ip_assignment,
      confidentiality, dpa_signed_at, trial_gold_items, trial_agreement, agreement_threshold, trial_completed_at,
      trial_paid_at, sectors, availability, hours_per_week, notes, updated_by)
    VALUES (p_profile,
      (p_checklist ->> 'credentials_verified_at')::timestamptz, (p_checklist ->> 'contract_signed_at')::timestamptz,
      coalesce((p_checklist ->> 'ip_assignment')::boolean, false), coalesce((p_checklist ->> 'confidentiality')::boolean, false),
      (p_checklist ->> 'dpa_signed_at')::timestamptz, (p_checklist ->> 'trial_gold_items')::integer,
      (p_checklist ->> 'trial_agreement')::numeric, coalesce((p_checklist ->> 'agreement_threshold')::numeric, 0.8),
      (p_checklist ->> 'trial_completed_at')::timestamptz, (p_checklist ->> 'trial_paid_at')::timestamptz,
      coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p_checklist -> 'sectors', '[]'::jsonb))), ARRAY[]::text[]),
      coalesce(p_checklist ->> 'availability', 'unavailable'), (p_checklist ->> 'hours_per_week')::integer,
      nullif(p_checklist ->> 'notes', ''), actor)
    ON CONFLICT (expert_profile_id) DO UPDATE SET
      credentials_verified_at = excluded.credentials_verified_at, contract_signed_at = excluded.contract_signed_at,
      ip_assignment = excluded.ip_assignment, confidentiality = excluded.confidentiality, dpa_signed_at = excluded.dpa_signed_at,
      trial_gold_items = excluded.trial_gold_items, trial_agreement = excluded.trial_agreement,
      agreement_threshold = excluded.agreement_threshold, trial_completed_at = excluded.trial_completed_at,
      trial_paid_at = excluded.trial_paid_at, sectors = excluded.sectors, availability = excluded.availability,
      hours_per_week = excluded.hours_per_week, notes = excluded.notes, updated_by = actor, updated_at = now();
  -- Expert profiles are platform-wide, so the audit row has no workspace unless one is in context.
  profile_org := evals.org_id();
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (profile_org, actor, 'expert_onboarding.saved', p_profile::text, NULL);
  RETURN evals.expert_ready(p_profile);
END $$;

REVOKE ALL ON FUNCTION evals.next_working_day(timestamptz), evals.review_order_recorded_reviewers(uuid, uuid),
  evals.expert_ready(uuid), evals.guard_expert_review_label(),
  evals.request_expert_review(uuid, uuid, text, text, text, date, text, text, jsonb),
  evals.mark_review_request_notified(uuid, uuid), evals.update_review_request(uuid, text, text),
  evals.create_review_order(uuid, text, text, timestamptz, numeric, text, text, uuid),
  evals.link_review_order_assignment(uuid, uuid), evals.review_order_progress(uuid),
  evals.complete_review_order(uuid, uuid), evals.cancel_review_order(uuid, text),
  evals.save_expert_onboarding(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.next_working_day(timestamptz), evals.expert_ready(uuid),
  evals.request_expert_review(uuid, uuid, text, text, text, date, text, text, jsonb),
  evals.mark_review_request_notified(uuid, uuid), evals.update_review_request(uuid, text, text),
  evals.create_review_order(uuid, text, text, timestamptz, numeric, text, text, uuid),
  evals.link_review_order_assignment(uuid, uuid), evals.review_order_progress(uuid),
  evals.complete_review_order(uuid, uuid), evals.cancel_review_order(uuid, text),
  evals.save_expert_onboarding(uuid, jsonb) TO evals_runtime;

COMMIT;
