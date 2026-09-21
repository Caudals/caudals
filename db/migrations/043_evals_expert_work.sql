-- WP-14: restricted expert assignments, append-only submissions and independent QA.
BEGIN;

CREATE FUNCTION evals.is_operator() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,evals AS $$
  SELECT EXISTS(
    SELECT 1 FROM evals.platform_role
    WHERE user_id=evals.actor_id() AND role IN ('platform_admin','operator')
  )
$$;

CREATE TABLE evals.expert_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE REFERENCES public.auth_user(id),
  domains text[] NOT NULL CHECK(cardinality(domains) BETWEEN 1 AND 30),
  jurisdictions text[] NOT NULL CHECK(cardinality(jurisdictions)<=30),
  languages text[] NOT NULL CHECK(cardinality(languages) BETWEEN 1 AND 20),
  credentials_status text NOT NULL CHECK(credentials_status IN ('pending','verified','rejected')),
  terms_status text NOT NULL CHECK(terms_status IN ('pending','accepted','expired')),
  eligibility_status text NOT NULL CHECK(eligibility_status IN ('inactive','calibrating','eligible','suspended')),
  created_by text NOT NULL REFERENCES public.auth_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evals.expert_guideline_revision (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  project_id uuid NOT NULL,
  guideline_id uuid NOT NULL,
  supersedes_revision_id uuid,
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  document jsonb NOT NULL,
  created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,guideline_id,content_hash),
  FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
  FOREIGN KEY(org_id,supersedes_revision_id) REFERENCES evals.expert_guideline_revision(org_id,id)
);

CREATE TABLE evals.expert_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  project_id uuid NOT NULL,
  assigned_profile_id uuid NOT NULL REFERENCES evals.expert_profile(id),
  kind text NOT NULL CHECK(kind IN ('authoring','independent_review','adjudication','calibration')),
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  guideline_revision_id uuid NOT NULL,
  replacement_guideline_revision_id uuid,
  review_of_submission_revision_id uuid,
  current_submission_revision_id uuid,
  status text NOT NULL DEFAULT 'assigned' CHECK(status IN (
    'assigned','in_progress','conflict','guideline_changed','submitted',
    'in_review','changes_requested','approved','rejected','adjudicated','canceled'
  )),
  review_phase text NOT NULL DEFAULT 'blind' CHECK(review_phase IN ('blind','revealed')),
  lock_version integer NOT NULL DEFAULT 0 CHECK(lock_version>=0),
  due_at timestamptz,
  created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id),
  FOREIGN KEY(org_id,guideline_revision_id) REFERENCES evals.expert_guideline_revision(org_id,id),
  FOREIGN KEY(org_id,replacement_guideline_revision_id) REFERENCES evals.expert_guideline_revision(org_id,id),
  CHECK(
    (kind IN ('independent_review','adjudication') AND review_of_submission_revision_id IS NOT NULL)
    OR (kind IN ('authoring','calibration') AND review_of_submission_revision_id IS NULL)
  )
);

CREATE TABLE evals.expert_assignment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,assignment_id),
  FOREIGN KEY(org_id,assignment_id) REFERENCES evals.expert_assignment(org_id,id)
);

CREATE TABLE evals.expert_conflict_declaration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  expert_profile_id uuid NOT NULL REFERENCES evals.expert_profile(id),
  status text NOT NULL CHECK(status IN ('clear','disclosed')),
  details text CHECK(details IS NULL OR length(details)<=4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  FOREIGN KEY(org_id,assignment_id) REFERENCES evals.expert_assignment(org_id,id)
);

CREATE TABLE evals.expert_submission_revision (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  author_profile_id uuid NOT NULL REFERENCES evals.expert_profile(id),
  version integer NOT NULL CHECK(version>0),
  parent_lock_version integer NOT NULL CHECK(parent_lock_version>=0),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  document jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('draft','submitted')),
  conflict boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,assignment_id,version),
  FOREIGN KEY(org_id,assignment_id) REFERENCES evals.expert_assignment(org_id,id)
);

ALTER TABLE evals.expert_assignment
  ADD FOREIGN KEY(org_id,review_of_submission_revision_id)
    REFERENCES evals.expert_submission_revision(org_id,id),
  ADD FOREIGN KEY(org_id,current_submission_revision_id)
    REFERENCES evals.expert_submission_revision(org_id,id);

CREATE TABLE evals.expert_quality_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  review_assignment_id uuid NOT NULL,
  submission_revision_id uuid NOT NULL,
  author_profile_id uuid NOT NULL REFERENCES evals.expert_profile(id),
  reviewer_profile_id uuid NOT NULL REFERENCES evals.expert_profile(id),
  decision text NOT NULL CHECK(decision IN ('approve','changes_requested','reject')),
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  rationale text NOT NULL CHECK(length(rationale) BETWEEN 1 AND 12000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,review_assignment_id),
  FOREIGN KEY(org_id,review_assignment_id) REFERENCES evals.expert_assignment(org_id,id),
  FOREIGN KEY(org_id,submission_revision_id) REFERENCES evals.expert_submission_revision(org_id,id)
);

CREATE TABLE evals.expert_payment_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  amount numeric(24,9) NOT NULL CHECK(amount>=0),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK(status IN ('planned','invoiced','paid','void')),
  note text NOT NULL CHECK(length(note)<=4000),
  created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  FOREIGN KEY(org_id,assignment_id) REFERENCES evals.expert_assignment(org_id,id)
);

CREATE FUNCTION evals.validate_expert_quality_review() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
DECLARE assignment_row evals.expert_assignment; submission_row evals.expert_submission_revision;
BEGIN
  IF NEW.author_profile_id=NEW.reviewer_profile_id THEN
    RAISE EXCEPTION 'INDEPENDENT_REVIEW_REQUIRED';
  END IF;
  SELECT * INTO assignment_row FROM evals.expert_assignment
    WHERE org_id=NEW.org_id AND id=NEW.review_assignment_id;
  SELECT * INTO submission_row FROM evals.expert_submission_revision
    WHERE org_id=NEW.org_id AND id=NEW.submission_revision_id;
  IF assignment_row.id IS NULL OR submission_row.id IS NULL
    OR assignment_row.assigned_profile_id<>NEW.reviewer_profile_id
    OR assignment_row.kind NOT IN ('independent_review','adjudication')
    OR assignment_row.review_of_submission_revision_id<>NEW.submission_revision_id
    OR submission_row.author_profile_id<>NEW.author_profile_id
    OR submission_row.status<>'submitted'
    OR assignment_row.severity<>NEW.severity
  THEN RAISE EXCEPTION 'INVALID_REVIEW_BINDING'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expert_quality_binding BEFORE INSERT ON evals.expert_quality_review
  FOR EACH ROW EXECUTE FUNCTION evals.validate_expert_quality_review();

ALTER TABLE evals.expert_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE evals.expert_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY expert_profile_read ON evals.expert_profile FOR SELECT
  USING(user_id=evals.actor_id() OR evals.is_operator());
CREATE POLICY expert_profile_create ON evals.expert_profile FOR INSERT
  WITH CHECK(evals.is_operator());
CREATE POLICY expert_profile_update ON evals.expert_profile FOR UPDATE
  USING(evals.is_operator()) WITH CHECK(evals.is_operator());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'expert_guideline_revision','expert_assignment','expert_assignment_evidence',
    'expert_conflict_declaration','expert_submission_revision','expert_quality_review',
    'expert_payment_record'
  ] LOOP
    EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;

CREATE POLICY expert_guideline_scope ON evals.expert_guideline_revision
  USING(
    org_id=evals.org_id()
    OR EXISTS(
      SELECT 1 FROM evals.expert_assignment a JOIN evals.expert_profile p ON p.id=a.assigned_profile_id
      WHERE a.org_id=expert_guideline_revision.org_id AND a.guideline_revision_id=expert_guideline_revision.id
        AND p.user_id=evals.actor_id()
    )
  ) WITH CHECK(org_id=evals.org_id());
CREATE POLICY expert_assignment_scope ON evals.expert_assignment
  USING(
    org_id=evals.org_id()
    OR EXISTS(SELECT 1 FROM evals.expert_profile p WHERE p.id=assigned_profile_id AND p.user_id=evals.actor_id())
  ) WITH CHECK(
    org_id=evals.org_id()
    OR EXISTS(SELECT 1 FROM evals.expert_profile p WHERE p.id=assigned_profile_id AND p.user_id=evals.actor_id())
  );
CREATE POLICY expert_evidence_scope ON evals.expert_assignment_evidence
  USING(EXISTS(
    SELECT 1 FROM evals.expert_assignment a
    WHERE (a.org_id,a.id)=(expert_assignment_evidence.org_id,expert_assignment_evidence.assignment_id)
  )) WITH CHECK(org_id=evals.org_id());
CREATE POLICY expert_conflict_scope ON evals.expert_conflict_declaration
  USING(EXISTS(
    SELECT 1 FROM evals.expert_assignment a
    WHERE (a.org_id,a.id)=(expert_conflict_declaration.org_id,expert_conflict_declaration.assignment_id)
  )) WITH CHECK(
    org_id=evals.org_id()
    OR EXISTS(
      SELECT 1 FROM evals.expert_assignment a JOIN evals.expert_profile p ON p.id=a.assigned_profile_id
      WHERE (a.org_id,a.id)=(expert_conflict_declaration.org_id,expert_conflict_declaration.assignment_id)
        AND p.user_id=evals.actor_id() AND p.id=expert_profile_id
    )
  );
CREATE POLICY expert_submission_scope ON evals.expert_submission_revision
  USING(
    EXISTS(
      SELECT 1 FROM evals.expert_assignment a
      WHERE (a.org_id,a.id)=(expert_submission_revision.org_id,expert_submission_revision.assignment_id)
    )
    OR EXISTS(
      SELECT 1 FROM evals.expert_assignment review_assignment
      JOIN evals.expert_profile reviewer ON reviewer.id=review_assignment.assigned_profile_id
      WHERE (review_assignment.org_id,review_assignment.review_of_submission_revision_id)=
        (expert_submission_revision.org_id,expert_submission_revision.id)
        AND reviewer.user_id=evals.actor_id()
    )
  ) WITH CHECK(
    org_id=evals.org_id()
    OR EXISTS(
      SELECT 1 FROM evals.expert_assignment a JOIN evals.expert_profile p ON p.id=a.assigned_profile_id
      WHERE (a.org_id,a.id)=(expert_submission_revision.org_id,expert_submission_revision.assignment_id)
        AND p.user_id=evals.actor_id() AND p.id=author_profile_id
    )
  );
CREATE POLICY expert_quality_scope ON evals.expert_quality_review
  USING(EXISTS(
    SELECT 1 FROM evals.expert_assignment a
    WHERE (a.org_id,a.id)=(expert_quality_review.org_id,expert_quality_review.review_assignment_id)
  )) WITH CHECK(
    org_id=evals.org_id()
    OR EXISTS(
      SELECT 1 FROM evals.expert_assignment a JOIN evals.expert_profile p ON p.id=a.assigned_profile_id
      WHERE (a.org_id,a.id)=(expert_quality_review.org_id,expert_quality_review.review_assignment_id)
        AND p.user_id=evals.actor_id() AND p.id=reviewer_profile_id
    )
  );
CREATE POLICY expert_payment_scope ON evals.expert_payment_record
  USING(org_id=evals.org_id()) WITH CHECK(org_id=evals.org_id());

GRANT SELECT,INSERT,UPDATE(domains,jurisdictions,languages,credentials_status,terms_status,eligibility_status,updated_at)
  ON evals.expert_profile TO evals_runtime;
GRANT SELECT,INSERT ON evals.expert_guideline_revision,evals.expert_assignment,
  evals.expert_assignment_evidence,evals.expert_conflict_declaration,
  evals.expert_submission_revision,evals.expert_quality_review,evals.expert_payment_record
  TO evals_runtime;
GRANT UPDATE(status,review_phase,lock_version,current_submission_revision_id,
  replacement_guideline_revision_id,updated_at) ON evals.expert_assignment TO evals_runtime;

CREATE TRIGGER expert_guideline_immutable BEFORE UPDATE OR DELETE ON evals.expert_guideline_revision
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER expert_evidence_immutable BEFORE UPDATE OR DELETE ON evals.expert_assignment_evidence
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER expert_conflict_immutable BEFORE UPDATE OR DELETE ON evals.expert_conflict_declaration
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER expert_submission_immutable BEFORE UPDATE OR DELETE ON evals.expert_submission_revision
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER expert_quality_immutable BEFORE UPDATE OR DELETE ON evals.expert_quality_review
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER expert_payment_immutable BEFORE UPDATE OR DELETE ON evals.expert_payment_record
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();

CREATE INDEX expert_profile_user ON evals.expert_profile(user_id,id);
CREATE INDEX expert_guideline_project ON evals.expert_guideline_revision(org_id,project_id,created_at DESC,id);
CREATE INDEX expert_assignment_profile ON evals.expert_assignment(assigned_profile_id,status,updated_at DESC,id);
CREATE INDEX expert_assignment_org ON evals.expert_assignment(org_id,project_id,status,updated_at DESC,id);
CREATE INDEX expert_submission_assignment ON evals.expert_submission_revision(org_id,assignment_id,version DESC);
CREATE INDEX expert_quality_submission ON evals.expert_quality_review(org_id,submission_revision_id,created_at,id);
CREATE INDEX expert_payment_assignment ON evals.expert_payment_record(org_id,assignment_id,created_at,id);

REVOKE ALL ON FUNCTION evals.is_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.validate_expert_quality_review() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evals.is_operator() TO evals_runtime;

COMMIT;
