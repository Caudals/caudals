-- M2 active-learning loop.
-- Adds operator-scoped FiftyOne Brain / Lightly-style sampling records for G-6 labeling review.

CREATE TABLE IF NOT EXISTS active_learning_loop (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'll')),
  org_id text NOT NULL REFERENCES organization(id),
  build_id text REFERENCES build(id),
  label_batch_id text REFERENCES label_batch(id),
  strategy text NOT NULL CHECK (
    strategy IN ('fiftyone_brain','lightly_embeddings','hybrid_uncertainty_diversity')
  ),
  state text NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft','sampling','review','queued','closed','blocked')
  ),
  candidate_source_uri text NOT NULL,
  embedding_index_uri text NOT NULL,
  model_snapshot_uri text NOT NULL,
  uncertainty_metric text NOT NULL,
  diversity_metric text NOT NULL,
  boundary_metric text NOT NULL,
  target_sample_size integer NOT NULL CHECK (target_sample_size > 0),
  selected_count integer NOT NULL DEFAULT 0 CHECK (selected_count >= 0),
  selection_manifest_uri text,
  selection_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_routing jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  deleted_at timestamptz,
  CONSTRAINT active_learning_loop_selected_lte_target_check
    CHECK (selected_count <= target_sample_size)
);

CREATE INDEX IF NOT EXISTS active_learning_loop_org_state_idx
  ON active_learning_loop (org_id, state, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS active_learning_loop_build_idx
  ON active_learning_loop (build_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS active_learning_candidate (
  id text PRIMARY KEY CHECK (app_private.assert_ulid_prefixed(id, 'ac')),
  org_id text NOT NULL REFERENCES organization(id),
  active_learning_loop_id text NOT NULL REFERENCES active_learning_loop(id) ON DELETE CASCADE,
  item_ref text NOT NULL,
  uncertainty_score numeric(5,4) NOT NULL CHECK (uncertainty_score >= 0 AND uncertainty_score <= 1),
  diversity_score numeric(5,4) NOT NULL CHECK (diversity_score >= 0 AND diversity_score <= 1),
  boundary_score numeric(5,4) NOT NULL CHECK (boundary_score >= 0 AND boundary_score <= 1),
  combined_score numeric(5,4) NOT NULL CHECK (combined_score >= 0 AND combined_score <= 1),
  selection_reason text NOT NULL,
  route_state text NOT NULL DEFAULT 'selected' CHECK (route_state IN ('selected','deferred','excluded')),
  reviewer_priority integer NOT NULL DEFAULT 0 CHECK (reviewer_priority >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "operator"(id),
  UNIQUE (active_learning_loop_id, item_ref)
);

CREATE INDEX IF NOT EXISTS active_learning_candidate_loop_rank_idx
  ON active_learning_candidate (
    active_learning_loop_id,
    route_state,
    combined_score DESC,
    reviewer_priority ASC
  );

DROP TRIGGER IF EXISTS active_learning_loop_touch_updated_at ON active_learning_loop;
CREATE TRIGGER active_learning_loop_touch_updated_at
  BEFORE UPDATE ON active_learning_loop
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE active_learning_loop ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS active_learning_loop_operator_scope ON active_learning_loop;
CREATE POLICY active_learning_loop_operator_scope ON active_learning_loop
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());

ALTER TABLE active_learning_candidate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS active_learning_candidate_operator_scope ON active_learning_candidate;
CREATE POLICY active_learning_candidate_operator_scope ON active_learning_candidate
  USING (app_private.is_service_role() OR org_id = app_private.current_org_id())
  WITH CHECK (app_private.is_service_role() OR org_id = app_private.current_org_id());
