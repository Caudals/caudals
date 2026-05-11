-- Roll back M2 active-learning loop records.

DROP POLICY IF EXISTS active_learning_candidate_operator_scope ON active_learning_candidate;
ALTER TABLE IF EXISTS active_learning_candidate DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS active_learning_candidate;

DROP POLICY IF EXISTS active_learning_loop_operator_scope ON active_learning_loop;
ALTER TABLE IF EXISTS active_learning_loop DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS active_learning_loop_touch_updated_at ON active_learning_loop;
DROP TABLE IF EXISTS active_learning_loop;
