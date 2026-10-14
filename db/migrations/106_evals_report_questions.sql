-- "Pregunta a tu informe" — ask your report (launch L-36; spec v2 P-58,
-- §6.3, §6.8, R20).
--
-- A workspace member asks a question about one report revision. The answer
-- is a bounded engine job (role report_writer, the report's frozen model
-- route) that sees only that revision's snapshot, quoted as data. Every claim
-- must cite result or finding ids of the snapshot; an answer whose citations
-- do not validate is discarded ("I can't answer that from this report.").
--
-- evals.report_question keeps the question, the validated answer, the cited
-- ids, the revision, the model and prompt revisions, the tokens and the
-- credit-ledger outcome of its one engine call:
--
--   * ledger_outcome is `pending` while the call may still happen, then
--     exactly one of `captured` (the call completed), `released` (it failed
--     or timed out: refunded) or `none` (no call was made: a fixed refusal,
--     or the question expired before any hold). A settled outcome never
--     changes (trigger).
--   * Members of the workspace (and Caudals platform staff, for audited
--     support) can read rows; owners, editors and operators can ask; owners
--     and operators delete. Experts are never members, so they get nothing,
--     and no document, browser or expert role has a grant. The rows are
--     never used for training: nothing reads them outside these paths.
--   * Deleting erases the question and the answer and keeps the metadata
--     (tokens, credits, ledger references, status), so caps and billing stay
--     traceable. The engine call's own immutable execution record follows the
--     evidence retention policy like every engine call.
--   * Caps (database-enforced): at most 20 questions per report a day (UTC)
--     on every plan, and 10 a month (UTC) per workspace on the free plan.
--     Questions that failed or timed out on our side do not count.
--
-- The inference worker updates the outcome of a question it answers, inside
-- the transaction that settles the call (one policy, column grants).
--
-- Forward repair: additive. The rollback refuses while any question exists.
BEGIN;
SET LOCAL lock_timeout = '10s';

/* ------------------------------------------------------------- helpers --- */

-- Members of the current workspace (any role) and Caudals platform staff.
CREATE FUNCTION evals.report_question_reader() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT evals.is_platform_staff()
      OR EXISTS (SELECT 1 FROM evals.membership WHERE org_id = evals.org_id() AND user_id = evals.actor_id())
$$;
REVOKE ALL ON FUNCTION evals.report_question_reader() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.report_question_reader() TO evals_runtime;

-- Who may ask (and spend credits): owners, editors and operators, and staff.
CREATE FUNCTION evals.report_question_asker() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT evals.is_platform_staff()
      OR EXISTS (SELECT 1 FROM evals.membership WHERE org_id = evals.org_id() AND user_id = evals.actor_id() AND role IN ('owner','editor','operator'))
$$;
REVOKE ALL ON FUNCTION evals.report_question_asker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.report_question_asker() TO evals_runtime;

/* ------------------------------------------------------------- questions --- */

CREATE TABLE evals.report_question (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  report_id uuid NOT NULL,
  report_revision_id uuid NOT NULL,
  run_id uuid NOT NULL,
  asked_by text NOT NULL CHECK (length(asked_by) BETWEEN 1 AND 255),
  -- NULL only once deleted.
  question text CONSTRAINT report_question_text CHECK (question IS NULL OR length(question) BETWEEN 1 AND 500),
  -- The language of the question; the answer and the fixed texts use it.
  language text NOT NULL CHECK (language IN ('en','es')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','answered','refused','unanswerable','failed','timed_out')),
  reason_code text CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  -- {sentences:[{text, result_ids, finding_ids}]}: only validated answers.
  answer jsonb CHECK (answer IS NULL OR jsonb_typeof(answer) = 'object'),
  cited_result_ids text[] NOT NULL DEFAULT '{}' CHECK (cardinality(cited_result_ids) <= 1200),
  cited_finding_ids text[] NOT NULL DEFAULT '{}' CHECK (cardinality(cited_finding_ids) <= 1200),
  -- Provenance of the one engine call.
  prompt_revision text NOT NULL CHECK (length(prompt_revision) BETWEEN 3 AND 80),
  packet_hash text CHECK (packet_hash IS NULL OR packet_hash ~ '^[a-f0-9]{64}$'),
  -- The revision's short references the model cites: {"results":{"T1":id},"findings":{"F1":id}}.
  -- The worker validates citations against it without reading the snapshot.
  refs jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(refs) = 'object'),
  model_revision_id uuid,
  price_revision_id uuid,
  model_id text CHECK (model_id IS NULL OR length(model_id) BETWEEN 1 AND 200),
  model_source text CHECK (model_source IS NULL OR model_source IN ('run','workspace')),
  data_routing text CHECK (data_routing IS NULL OR data_routing IN ('local_only','approved_providers','customer_provider')),
  workflow_id uuid,
  step_id uuid,
  attempt_id uuid,
  input_bound integer CHECK (input_bound IS NULL OR input_bound > 0),
  output_bound integer CHECK (output_bound IS NULL OR output_bound > 0),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  token_provenance text CHECK (token_provenance IS NULL OR token_provenance IN ('provider_reported','bounded_estimate')),
  -- Credit ledger (§6.8): mode when settled, outcome, key and amounts.
  ledger_mode text CHECK (ledger_mode IS NULL OR ledger_mode IN ('off','shadow','enforce','contract','free')),
  ledger_outcome text NOT NULL DEFAULT 'pending' CHECK (ledger_outcome IN ('pending','captured','released','none')),
  ledger_key text CHECK (ledger_key IS NULL OR ledger_key ~ '^attempt:[0-9a-f-]{36}$'),
  ledger_entry_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(ledger_entry_ids) <= 10),
  price_book_revision_id uuid,
  held_ucr bigint CHECK (held_ucr IS NULL OR held_ucr >= 0),
  charged_ucr bigint NOT NULL DEFAULT 0 CHECK (charged_ucr >= 0),
  deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by text CHECK (deleted_by IS NULL OR length(deleted_by) BETWEEN 1 AND 255),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, report_revision_id) REFERENCES evals.report_revision(org_id, id),
  FOREIGN KEY (org_id, report_id) REFERENCES evals.report(org_id, id),
  CONSTRAINT report_question_deleted CHECK (
    (deleted_at IS NULL AND question IS NOT NULL AND deleted_by IS NULL)
    OR (deleted_at IS NOT NULL AND question IS NULL AND answer IS NULL AND deleted_by IS NOT NULL)),
  -- An answer is shown only with citations; a queued question has no outcome yet.
  CONSTRAINT report_question_answered CHECK (status <> 'answered'
    OR deleted_at IS NOT NULL
    OR (answer IS NOT NULL AND cardinality(cited_result_ids) + cardinality(cited_finding_ids) >= 1)),
  CONSTRAINT report_question_settled CHECK (
    (status = 'queued') = (ledger_outcome = 'pending')
    AND (status = 'queued' OR finished_at IS NOT NULL)
    AND (ledger_outcome = 'captured' OR charged_ucr = 0))
);
CREATE INDEX report_question_report ON evals.report_question (org_id, report_id, created_at);
CREATE INDEX report_question_workspace ON evals.report_question (org_id, created_at);
COMMENT ON TABLE evals.report_question IS
  'Ask your report (L-36): questions about one report revision and their cited answers. Members read, owners delete; never shown to experts or used for training.';

-- Caps and one-way lifecycle.
CREATE FUNCTION evals.report_question_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE day_count integer; month_count integer; plan text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.org_id IS DISTINCT FROM evals.org_id() THEN
      RAISE EXCEPTION 'report question outside the workspace' USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN ('queued','refused') OR NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new question is queued or refused' USING ERRCODE = '23514';
    END IF;
    -- One counter per workspace: concurrent questions cannot pass a cap together.
    PERFORM pg_advisory_xact_lock(hashtextextended('evals.report_question:' || NEW.org_id::text, 0));
    SELECT count(*) INTO day_count FROM evals.report_question q
      WHERE q.org_id = NEW.org_id AND q.report_id = NEW.report_id
        AND q.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        AND q.status NOT IN ('failed','timed_out');
    IF day_count >= 20 THEN
      RAISE EXCEPTION 'REPORT_QUESTION_DAILY_LIMIT' USING ERRCODE = 'P0001';
    END IF;
    SELECT e.plan INTO plan FROM evals.workspace_entitlement e WHERE e.org_id = NEW.org_id;
    IF plan = 'free' THEN
      SELECT count(*) INTO month_count FROM evals.report_question q
        WHERE q.org_id = NEW.org_id
          AND q.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          AND q.status NOT IN ('failed','timed_out');
      IF month_count >= 10 THEN
        RAISE EXCEPTION 'REPORT_QUESTION_MONTHLY_LIMIT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: identity and provenance never change.
  IF (NEW.id, NEW.org_id, NEW.report_id, NEW.report_revision_id, NEW.run_id, NEW.asked_by, NEW.language, NEW.prompt_revision,
      NEW.packet_hash, NEW.refs, NEW.model_revision_id, NEW.price_revision_id, NEW.model_id, NEW.workflow_id, NEW.step_id,
      NEW.input_bound, NEW.output_bound, NEW.deadline_at, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.org_id, OLD.report_id, OLD.report_revision_id, OLD.run_id, OLD.asked_by, OLD.language, OLD.prompt_revision,
      OLD.packet_hash, OLD.refs, OLD.model_revision_id, OLD.price_revision_id, OLD.model_id, OLD.workflow_id, OLD.step_id,
      OLD.input_bound, OLD.output_bound, OLD.deadline_at, OLD.created_at) THEN
    RAISE EXCEPTION 'immutable report question' USING ERRCODE = '55000';
  END IF;
  -- A question can only be erased, never rewritten.
  IF NEW.question IS DISTINCT FROM OLD.question AND NEW.question IS NOT NULL THEN
    RAISE EXCEPTION 'immutable report question' USING ERRCODE = '55000';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.answer IS NOT NULL) THEN
    RAISE EXCEPTION 'deleted report question' USING ERRCODE = '55000';
  END IF;
  -- One outcome: a settled question and its ledger outcome never change.
  IF OLD.status <> 'queued' AND (NEW.status, NEW.reason_code, NEW.ledger_outcome, NEW.charged_ucr, NEW.held_ucr, NEW.ledger_key, NEW.attempt_id)
       IS DISTINCT FROM (OLD.status, OLD.reason_code, OLD.ledger_outcome, OLD.charged_ucr, OLD.held_ucr, OLD.ledger_key, OLD.attempt_id) THEN
    RAISE EXCEPTION 'settled report question' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> 'queued' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL AND NEW.answer IS DISTINCT FROM OLD.answer THEN
    RAISE EXCEPTION 'settled report question' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION evals.report_question_guard() FROM PUBLIC;
CREATE TRIGGER report_question_guard BEFORE INSERT OR UPDATE ON evals.report_question
  FOR EACH ROW EXECUTE FUNCTION evals.report_question_guard();
CREATE FUNCTION evals.report_question_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'report questions are erased, not deleted' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER report_question_no_delete BEFORE DELETE ON evals.report_question
  FOR EACH ROW EXECUTE FUNCTION evals.report_question_no_delete();

ALTER TABLE evals.report_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.report_question FORCE ROW LEVEL SECURITY;
CREATE POLICY report_question_read ON evals.report_question FOR SELECT TO evals_runtime
  USING (org_id = evals.org_id() AND evals.report_question_reader());
CREATE POLICY report_question_ask ON evals.report_question FOR INSERT TO evals_runtime
  WITH CHECK (org_id = evals.org_id() AND asked_by = evals.actor_id() AND evals.report_question_asker());
REVOKE ALL ON evals.report_question FROM PUBLIC;
GRANT SELECT ON evals.report_question TO evals_runtime;
GRANT INSERT (id, org_id, report_id, report_revision_id, run_id, asked_by, question, language, status, reason_code,
  prompt_revision, packet_hash, refs, model_revision_id, price_revision_id, model_id, model_source, data_routing, workflow_id, step_id,
  input_bound, output_bound, ledger_mode, ledger_outcome, deadline_at, finished_at) ON evals.report_question TO evals_runtime;

-- The inference worker settles the questions it answers (and expires the ones
-- it reaches after their deadline), in the transaction that settles the call.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evals_worker') THEN
    CREATE POLICY report_question_worker ON evals.report_question FOR SELECT TO evals_worker
      USING (org_id = evals.org_id());
    CREATE POLICY report_question_worker_settle ON evals.report_question FOR UPDATE TO evals_worker
      USING (org_id = evals.org_id()) WITH CHECK (org_id = evals.org_id());
    GRANT SELECT ON evals.report_question TO evals_worker;
    GRANT UPDATE (status, reason_code, answer, cited_result_ids, cited_finding_ids, attempt_id, input_tokens, output_tokens,
      token_provenance, ledger_mode, ledger_outcome, ledger_key, ledger_entry_ids, price_book_revision_id, held_ucr, charged_ucr,
      finished_at, updated_at) ON evals.report_question TO evals_worker;
  END IF;
END $$;

/* -------------------------------------------------------------- delete --- */

-- Owners and operators of the workspace, and platform admins, erase a
-- question and its answer. Metadata stays (caps, credits, ledger references).
-- Audited without the text. Returns false when the question is not there or
-- is already erased.
CREATE FUNCTION evals.delete_report_question(p_question_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE org uuid := evals.org_id(); actor text := evals.actor_id(); found_id uuid;
BEGIN
  IF org IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'tenant scope required' USING ERRCODE = '42501'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM evals.platform_role WHERE user_id = actor AND role = 'platform_admin')
          OR EXISTS (SELECT 1 FROM evals.membership WHERE org_id = org AND user_id = actor AND role IN ('owner','operator'))) THEN
    RAISE EXCEPTION 'only owners can delete questions' USING ERRCODE = '42501';
  END IF;
  UPDATE evals.report_question SET question = NULL, answer = NULL, deleted_at = now(), deleted_by = actor
    WHERE org_id = org AND id = p_question_id AND deleted_at IS NULL
    RETURNING id INTO found_id;
  IF found_id IS NULL THEN RETURN false; END IF;
  INSERT INTO evals.audit_event(org_id, actor_id, action, subject_id) VALUES (org, actor, 'report_question.deleted', found_id::text);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION evals.delete_report_question(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.delete_report_question(uuid) TO evals_runtime;

COMMIT;
