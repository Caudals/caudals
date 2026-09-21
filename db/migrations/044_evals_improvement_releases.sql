-- WP-15: traceable improvement items, independently reviewed releases and follow-up evidence.
BEGIN;

CREATE TABLE evals.improvement_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES evals.workspace(id),
  project_id uuid NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  objective text NOT NULL DEFAULT '' CHECK(length(objective)<=12000),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','released','canceled')),
  lock_version integer NOT NULL DEFAULT 0 CHECK(lock_version>=0),
  created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,id,project_id),
  FOREIGN KEY(org_id,project_id) REFERENCES evals.project(org_id,id)
);

CREATE TABLE evals.improvement_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  finding_id uuid NOT NULL,
  expert_assignment_id uuid,
  kind text NOT NULL CHECK(kind IN ('grounded_qa','corrected_response','preference_pair','retrieval_content')),
  family_id text NOT NULL CHECK(length(family_id) BETWEEN 1 AND 200),
  split text NOT NULL CHECK(split IN ('development','training','validation','holdout')),
  rights_basis text NOT NULL CHECK(rights_basis IN ('caudals_owned_synthetic','caudals_owned','customer_owned','licensed','public_domain')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','submitted','approved','rejected','canceled')),
  created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,batch_id,id),
  FOREIGN KEY(org_id,batch_id) REFERENCES evals.improvement_batch(org_id,id),
  FOREIGN KEY(org_id,finding_id) REFERENCES evals.finding(org_id,id),
  FOREIGN KEY(org_id,expert_assignment_id) REFERENCES evals.expert_assignment(org_id,id)
);

CREATE TABLE evals.dataset_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  task_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('grounded_qa','corrected_response','preference_pair','retrieval_content')),
  family_id text NOT NULL CHECK(length(family_id) BETWEEN 1 AND 200),
  split text NOT NULL CHECK(split IN ('development','training','validation','holdout')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,id,task_id),
  FOREIGN KEY(org_id,batch_id,task_id) REFERENCES evals.improvement_task(org_id,batch_id,id)
);

CREATE TABLE evals.dataset_item_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  item_id uuid NOT NULL,
  task_id uuid NOT NULL,
  finding_id uuid NOT NULL,
  submission_revision_id uuid NOT NULL,
  author_profile_id uuid NOT NULL REFERENCES evals.expert_profile(id),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,item_id,content_hash),
  FOREIGN KEY(org_id,item_id,task_id) REFERENCES evals.dataset_item(org_id,id,task_id),
  FOREIGN KEY(org_id,task_id) REFERENCES evals.improvement_task(org_id,id),
  FOREIGN KEY(org_id,finding_id) REFERENCES evals.finding(org_id,id),
  FOREIGN KEY(org_id,submission_revision_id) REFERENCES evals.expert_submission_revision(org_id,id)
);

CREATE TABLE evals.dataset_item_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  item_revision_id uuid NOT NULL,
  reviewer_profile_id uuid NOT NULL REFERENCES evals.expert_profile(id),
  decision text NOT NULL CHECK(decision IN ('approve','reject','changes_requested')),
  rights_status text NOT NULL CHECK(rights_status IN ('pending','permitted','restricted')),
  redaction_status text NOT NULL CHECK(redaction_status IN ('pending','approved','rejected')),
  rationale text NOT NULL CHECK(length(rationale) BETWEEN 1 AND 12000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,item_revision_id),
  FOREIGN KEY(org_id,item_revision_id) REFERENCES evals.dataset_item_revision(org_id,id)
);

CREATE TABLE evals.dataset_release (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  project_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  artifact_id uuid,
  public_key_fingerprint text NOT NULL CHECK(public_key_fingerprint ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'building' CHECK(status IN ('building','ready','failed')),
  created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,batch_id,revision),
  UNIQUE(org_id,id,project_id),
  FOREIGN KEY(org_id,batch_id,project_id) REFERENCES evals.improvement_batch(org_id,id,project_id),
  FOREIGN KEY(org_id,artifact_id) REFERENCES evals.artifact(org_id,id)
);

CREATE TABLE evals.dataset_release_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  release_id uuid NOT NULL,
  item_revision_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,release_id,item_revision_id),
  UNIQUE(org_id,release_id,ordinal),
  FOREIGN KEY(org_id,release_id) REFERENCES evals.dataset_release(org_id,id),
  FOREIGN KEY(org_id,item_revision_id) REFERENCES evals.dataset_item_revision(org_id,id)
);

CREATE TABLE evals.intervention_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL,
  release_id uuid NOT NULL,
  baseline_run_id uuid NOT NULL,
  description text NOT NULL CHECK(length(description) BETWEEN 1 AND 12000),
  evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 2000),
  created_by text NOT NULL DEFAULT current_setting('evals.actor_id'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,id,project_id,baseline_run_id),
  FOREIGN KEY(org_id,release_id,project_id) REFERENCES evals.dataset_release(org_id,id,project_id),
  FOREIGN KEY(org_id,baseline_run_id) REFERENCES evals.run(org_id,id)
);

CREATE TABLE evals.intervention_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  intervention_id uuid NOT NULL,
  followup_run_id uuid NOT NULL,
  comparison_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id),
  UNIQUE(org_id,intervention_id,followup_run_id),
  FOREIGN KEY(org_id,intervention_id) REFERENCES evals.intervention_record(org_id,id),
  FOREIGN KEY(org_id,followup_run_id) REFERENCES evals.run(org_id,id),
  FOREIGN KEY(org_id,comparison_id) REFERENCES evals.comparison(org_id,id)
);

CREATE FUNCTION evals.validate_improvement_task() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
DECLARE batch_project uuid; finding_project uuid; assignment_project uuid;
BEGIN
  SELECT project_id INTO batch_project FROM evals.improvement_batch WHERE org_id=NEW.org_id AND id=NEW.batch_id;
  SELECT e.project_id INTO finding_project FROM evals.finding f
    JOIN evals.run r ON (r.org_id,r.id)=(f.org_id,f.run_id)
    JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
    WHERE f.org_id=NEW.org_id AND f.id=NEW.finding_id;
  IF NEW.expert_assignment_id IS NOT NULL THEN
    SELECT project_id INTO assignment_project FROM evals.expert_assignment
      WHERE org_id=NEW.org_id AND id=NEW.expert_assignment_id;
  END IF;
  IF batch_project IS NULL OR finding_project IS DISTINCT FROM batch_project
    OR (NEW.expert_assignment_id IS NOT NULL AND assignment_project IS DISTINCT FROM batch_project)
  THEN RAISE EXCEPTION 'invalid_improvement_task_lineage'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER improvement_task_lineage BEFORE INSERT ON evals.improvement_task
  FOR EACH ROW EXECUTE FUNCTION evals.validate_improvement_task();

CREATE FUNCTION evals.validate_dataset_item_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
DECLARE task_finding uuid; task_assignment uuid; submission_author uuid; submission_assignment uuid;
BEGIN
  SELECT finding_id,expert_assignment_id INTO task_finding,task_assignment
    FROM evals.improvement_task WHERE org_id=NEW.org_id AND id=NEW.task_id;
  SELECT author_profile_id,assignment_id INTO submission_author,submission_assignment
    FROM evals.expert_submission_revision WHERE org_id=NEW.org_id AND id=NEW.submission_revision_id AND status='submitted';
  IF task_finding IS DISTINCT FROM NEW.finding_id OR task_assignment IS NULL
    OR submission_assignment IS DISTINCT FROM task_assignment
    OR submission_author IS DISTINCT FROM NEW.author_profile_id
  THEN RAISE EXCEPTION 'invalid_dataset_item_lineage'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dataset_item_revision_lineage BEFORE INSERT ON evals.dataset_item_revision
  FOR EACH ROW EXECUTE FUNCTION evals.validate_dataset_item_revision();

CREATE FUNCTION evals.validate_dataset_item_review() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
DECLARE author uuid;
BEGIN
  SELECT author_profile_id INTO author FROM evals.dataset_item_revision
    WHERE org_id=NEW.org_id AND id=NEW.item_revision_id;
  IF author IS NULL OR author=NEW.reviewer_profile_id THEN
    RAISE EXCEPTION 'independent_review_required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dataset_item_review_independent BEFORE INSERT ON evals.dataset_item_review
  FOR EACH ROW EXECUTE FUNCTION evals.validate_dataset_item_review();

CREATE FUNCTION evals.validate_dataset_release_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
DECLARE release_project uuid; release_batch uuid; item_batch uuid; item_family text; item_split text;
  author uuid; review_row evals.dataset_item_review;
BEGIN
  SELECT project_id,batch_id INTO release_project,release_batch FROM evals.dataset_release
    WHERE org_id=NEW.org_id AND id=NEW.release_id;
  SELECT i.batch_id,i.family_id,i.split,r.author_profile_id
    INTO item_batch,item_family,item_split,author
    FROM evals.dataset_item_revision r JOIN evals.dataset_item i ON (i.org_id,i.id)=(r.org_id,r.item_id)
    WHERE r.org_id=NEW.org_id AND r.id=NEW.item_revision_id;
  SELECT * INTO review_row FROM evals.dataset_item_review
    WHERE org_id=NEW.org_id AND item_revision_id=NEW.item_revision_id;
  IF release_project IS NULL OR item_batch IS DISTINCT FROM release_batch OR review_row.id IS NULL
    OR review_row.decision<>'approve' OR review_row.rights_status<>'permitted'
    OR review_row.redaction_status<>'approved' OR review_row.reviewer_profile_id=author
  THEN RAISE EXCEPTION 'release_candidate_not_approved'; END IF;
  IF (item_split='training' AND EXISTS(
      SELECT 1 FROM evals.case_revision cr JOIN evals."case" c ON (c.org_id,c.id)=(cr.org_id,cr.case_id)
      WHERE cr.org_id=NEW.org_id AND c.project_id=release_project AND cr.family_id=item_family AND cr.split='holdout'
    )) OR EXISTS(
      SELECT 1 FROM evals.dataset_release_item prior
      JOIN evals.dataset_release rel ON (rel.org_id,rel.id)=(prior.org_id,prior.release_id)
      JOIN evals.dataset_item_revision rev ON (rev.org_id,rev.id)=(prior.org_id,prior.item_revision_id)
      JOIN evals.dataset_item item ON (item.org_id,item.id)=(rev.org_id,rev.item_id)
      WHERE rel.org_id=NEW.org_id AND rel.project_id=release_project AND item.family_id=item_family
        AND ((item.split='holdout' AND item_split='training') OR (item.split='training' AND item_split='holdout'))
    ) THEN RAISE EXCEPTION 'family_split_overlap'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dataset_release_item_gate BEFORE INSERT ON evals.dataset_release_item
  FOR EACH ROW EXECUTE FUNCTION evals.validate_dataset_release_item();

CREATE FUNCTION evals.validate_intervention_record() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
DECLARE run_project uuid;
BEGIN
  SELECT e.project_id INTO run_project FROM evals.run r
    JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
    WHERE r.org_id=NEW.org_id AND r.id=NEW.baseline_run_id;
  IF run_project IS DISTINCT FROM NEW.project_id THEN RAISE EXCEPTION 'invalid_intervention_baseline'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER intervention_baseline_binding BEFORE INSERT ON evals.intervention_record
  FOR EACH ROW EXECUTE FUNCTION evals.validate_intervention_record();

CREATE FUNCTION evals.validate_intervention_validation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,evals AS $$
DECLARE intervention evals.intervention_record; comparison_row evals.comparison; followup_project uuid;
BEGIN
  SELECT * INTO intervention FROM evals.intervention_record WHERE org_id=NEW.org_id AND id=NEW.intervention_id;
  SELECT * INTO comparison_row FROM evals.comparison WHERE org_id=NEW.org_id AND id=NEW.comparison_id;
  SELECT e.project_id INTO followup_project FROM evals.run r
    JOIN evals.evaluation e ON (e.org_id,e.id)=(r.org_id,r.evaluation_id)
    WHERE r.org_id=NEW.org_id AND r.id=NEW.followup_run_id;
  IF intervention.id IS NULL OR comparison_row.id IS NULL OR followup_project IS DISTINCT FROM intervention.project_id
    OR comparison_row.project_id IS DISTINCT FROM intervention.project_id
    OR comparison_row.baseline_run_id IS DISTINCT FROM intervention.baseline_run_id
    OR comparison_row.candidate_run_id IS DISTINCT FROM NEW.followup_run_id
    OR comparison_row.status<>'compatible'
  THEN RAISE EXCEPTION 'invalid_intervention_validation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER intervention_validation_binding BEFORE INSERT ON evals.intervention_validation
  FOR EACH ROW EXECUTE FUNCTION evals.validate_intervention_validation();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'improvement_batch','improvement_task','dataset_item','dataset_item_revision',
    'dataset_item_review','dataset_release','dataset_release_item',
    'intervention_record','intervention_validation'
  ] LOOP
    EXECUTE format('ALTER TABLE evals.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE evals.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant ON evals.%I USING (org_id=evals.org_id()) WITH CHECK (org_id=evals.org_id())',t);
    EXECUTE format('GRANT SELECT,INSERT ON evals.%I TO evals_runtime',t);
  END LOOP;
END $$;
GRANT UPDATE(status,lock_version,updated_at) ON evals.improvement_batch TO evals_runtime;
GRANT UPDATE(status,expert_assignment_id,updated_at) ON evals.improvement_task TO evals_runtime;

CREATE TRIGGER dataset_item_immutable BEFORE UPDATE OR DELETE ON evals.dataset_item
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER dataset_item_revision_immutable BEFORE UPDATE OR DELETE ON evals.dataset_item_revision
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER dataset_item_review_immutable BEFORE UPDATE OR DELETE ON evals.dataset_item_review
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER dataset_release_immutable BEFORE UPDATE OR DELETE ON evals.dataset_release
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER dataset_release_item_immutable BEFORE UPDATE OR DELETE ON evals.dataset_release_item
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER intervention_record_immutable BEFORE UPDATE OR DELETE ON evals.intervention_record
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();
CREATE TRIGGER intervention_validation_immutable BEFORE UPDATE OR DELETE ON evals.intervention_validation
  FOR EACH ROW EXECUTE FUNCTION evals.reject_evidence_mutation();

CREATE INDEX improvement_batch_project ON evals.improvement_batch(org_id,project_id,updated_at DESC,id);
CREATE INDEX improvement_task_batch ON evals.improvement_task(org_id,batch_id,status,id);
CREATE INDEX dataset_item_batch ON evals.dataset_item(org_id,batch_id,split,family_id,id);
CREATE INDEX dataset_item_revision_item ON evals.dataset_item_revision(org_id,item_id,created_at DESC,id);
CREATE INDEX dataset_release_batch ON evals.dataset_release(org_id,batch_id,revision DESC,id);
CREATE INDEX intervention_project ON evals.intervention_record(org_id,project_id,created_at DESC,id);

REVOKE ALL ON FUNCTION evals.validate_improvement_task() FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.validate_dataset_item_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.validate_dataset_item_review() FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.validate_dataset_release_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.validate_intervention_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION evals.validate_intervention_validation() FROM PUBLIC;

COMMIT;
