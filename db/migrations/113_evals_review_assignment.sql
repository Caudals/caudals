-- "Assign to me" in the ops review queue (launch G1, spec v2 §5.3, L-21's
-- leftover): an operator claims a test set awaiting approval or a result
-- needing review, so two people do not work the same item.
--
-- * evals.review_assignment: one row per claim. At most one current
--   (unreleased) claim per item, enforced by a partial unique index. A claim
--   ends when its holder releases it, or when another member of staff takes
--   the item over (both recorded: who, when, why). Rows are never deleted;
--   the history is the audit of who held what.
--   An item is a test set awaiting approval (`evaluation`, the evaluation
--   whose preparation needs review) or a result needing review
--   (`assessment`, the assessment the queue shows).
-- * Only platform staff (operators and platform admins) read the rows, in the
--   workspace of the transaction. Customers never see them.
-- * Every write goes through evals.review_assignment_change(), SECURITY
--   DEFINER, which checks in SQL that the actor is staff with write access
--   to the live workspace (a platform admin, or a member with the owner,
--   editor or operator role, as requireWorkspace(..., "write") does), that
--   the item belongs to the workspace, serialises claims per item and writes
--   the audit trail (`review.assigned`, `review.unassigned`).
-- * evals.review_assignments(p_org) lists the current claims with the
--   holder's display name for the queue (auth names are not readable by the
--   runtime role).
--
-- Forward repair: purely additive. The rollback refuses while any
-- assignment exists.
BEGIN;

CREATE TABLE evals.review_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  subject_kind text NOT NULL
    CONSTRAINT review_assignment_kind CHECK (subject_kind IN ('evaluation','assessment')),
  subject_id uuid NOT NULL,
  assignee_id text NOT NULL,
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by text,
  release_reason text
    CONSTRAINT review_assignment_release_reason CHECK (release_reason IS NULL OR release_reason IN ('released','taken_over')),
  CONSTRAINT review_assignment_release_complete CHECK (
    (released_at IS NULL AND released_by IS NULL AND release_reason IS NULL)
    OR (released_at IS NOT NULL AND released_by IS NOT NULL AND release_reason IS NOT NULL))
);
CREATE UNIQUE INDEX review_assignment_current ON evals.review_assignment (org_id, subject_kind, subject_id) WHERE released_at IS NULL;
CREATE INDEX review_assignment_holder ON evals.review_assignment (assignee_id) WHERE released_at IS NULL;

ALTER TABLE evals.review_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.review_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY review_assignment_staff_read ON evals.review_assignment FOR SELECT
  USING (org_id = evals.org_id() AND evals.is_operator());
REVOKE ALL ON evals.review_assignment FROM PUBLIC;
GRANT SELECT ON evals.review_assignment TO evals_runtime;

-- Staff with write access to a live workspace (the SQL twin of
-- requireWorkspace(identity, org, "write") for platform staff).
CREATE FUNCTION evals.review_assignment_staff(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
  SELECT EXISTS (SELECT 1 FROM evals.workspace w WHERE w.id = p_org AND w.deleted_at IS NULL)
    AND (
      EXISTS (SELECT 1 FROM evals.platform_role r WHERE r.user_id = evals.actor_id() AND r.role = 'platform_admin')
      OR (
        EXISTS (SELECT 1 FROM evals.platform_role r WHERE r.user_id = evals.actor_id() AND r.role = 'operator')
        AND EXISTS (SELECT 1 FROM evals.membership m WHERE m.org_id = p_org AND m.user_id = evals.actor_id() AND m.role IN ('owner','editor','operator'))
      )
    )
$$;
REVOKE ALL ON FUNCTION evals.review_assignment_staff(uuid) FROM PUBLIC;

-- Claim ('assign') or release ('release') one queue item. 'assign' by the
-- current holder is a no-op; on an item someone else holds it raises
-- REVIEW_ASSIGNED unless p_take_over, which ends their claim as
-- 'taken_over'. 'release' ends the actor's own claim (a platform admin may
-- release anyone's); releasing an item nobody holds is a no-op. Returns the
-- current claim afterwards (no row when the item is free).
CREATE FUNCTION evals.review_assignment_change(p_org uuid, p_kind text, p_subject uuid, p_action text, p_take_over boolean)
RETURNS SETOF evals.review_assignment LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
DECLARE
  actor text := evals.actor_id();
  held evals.review_assignment;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF p_kind NOT IN ('evaluation','assessment') OR p_action NOT IN ('assign','release') THEN RAISE EXCEPTION 'INPUT_INVALID'; END IF;
  IF NOT evals.review_assignment_staff(p_org) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  IF p_kind = 'evaluation' AND NOT EXISTS (SELECT 1 FROM evals.evaluation e WHERE e.org_id = p_org AND e.id = p_subject AND e.archived_at IS NULL) THEN
    RAISE EXCEPTION 'SCOPE_DENIED';
  END IF;
  IF p_kind = 'assessment' AND NOT EXISTS (SELECT 1 FROM evals.assessment a WHERE a.org_id = p_org AND a.id = p_subject) THEN
    RAISE EXCEPTION 'SCOPE_DENIED';
  END IF;
  -- One change per item at a time: two people pressing "Assign to me" together get one claim and one REVIEW_ASSIGNED.
  PERFORM pg_advisory_xact_lock(hashtextextended('evals.review_assignment:' || p_org::text || ':' || p_kind || ':' || p_subject::text, 0));
  SELECT * INTO held FROM evals.review_assignment
    WHERE org_id = p_org AND subject_kind = p_kind AND subject_id = p_subject AND released_at IS NULL FOR UPDATE;

  IF p_action = 'release' THEN
    IF held.id IS NULL THEN RETURN; END IF;
    IF held.assignee_id <> actor AND NOT evals.is_admin() THEN RAISE EXCEPTION 'REVIEW_ASSIGNED'; END IF;
    UPDATE evals.review_assignment SET released_at = now(), released_by = actor, release_reason = 'released' WHERE id = held.id;
    INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
      VALUES (p_org, actor, 'review.unassigned', p_subject::text, jsonb_build_object('subject_kind', p_kind, 'assignee_id', held.assignee_id));
    RETURN;
  END IF;

  IF held.id IS NOT NULL AND held.assignee_id = actor THEN RETURN NEXT held; RETURN; END IF;
  IF held.id IS NOT NULL AND NOT coalesce(p_take_over, false) THEN RAISE EXCEPTION 'REVIEW_ASSIGNED'; END IF;
  IF held.id IS NOT NULL THEN
    UPDATE evals.review_assignment SET released_at = now(), released_by = actor, release_reason = 'taken_over' WHERE id = held.id;
  END IF;
  RETURN QUERY WITH claimed AS (
    INSERT INTO evals.review_assignment AS r (org_id, subject_kind, subject_id, assignee_id, assigned_by)
      VALUES (p_org, p_kind, p_subject, actor, actor) RETURNING r.*)
    SELECT * FROM claimed;
  INSERT INTO evals.audit_event (org_id, actor_id, action, subject_id, details)
    VALUES (p_org, actor, 'review.assigned', p_subject::text,
      jsonb_build_object('subject_kind', p_kind, 'taken_over_from', held.assignee_id));
END $$;
REVOKE ALL ON FUNCTION evals.review_assignment_change(uuid, text, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.review_assignment_change(uuid, text, uuid, text, boolean) TO evals_runtime;

-- Current claims in one workspace, with the holder's name, for staff.
CREATE FUNCTION evals.review_assignments(p_org uuid)
RETURNS TABLE (subject_kind text, subject_id uuid, assignee_id text, assignee_name text, assigned_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, evals AS $$
BEGIN
  IF evals.actor_id() IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED'; END IF;
  IF NOT evals.review_assignment_staff(p_org) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  RETURN QUERY SELECT a.subject_kind, a.subject_id, a.assignee_id, u.name::text, a.assigned_at
    FROM evals.review_assignment a LEFT JOIN public.auth_user u ON u.id = a.assignee_id
    WHERE a.org_id = p_org AND a.released_at IS NULL
    ORDER BY a.assigned_at
    LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION evals.review_assignments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.review_assignments(uuid) TO evals_runtime;

COMMIT;
