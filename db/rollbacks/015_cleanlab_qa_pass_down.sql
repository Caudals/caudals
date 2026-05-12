DROP POLICY IF EXISTS cleanlab_label_issue_operator_scope ON cleanlab_label_issue;
DROP POLICY IF EXISTS cleanlab_qa_pass_operator_scope ON cleanlab_qa_pass;

DROP TRIGGER IF EXISTS cleanlab_qa_pass_sync_report ON cleanlab_qa_pass;
DROP FUNCTION IF EXISTS app_private.sync_cleanlab_qa_pass_to_qa_report();

DROP TRIGGER IF EXISTS cleanlab_label_issue_touch_updated_at ON cleanlab_label_issue;
DROP TRIGGER IF EXISTS cleanlab_qa_pass_touch_updated_at ON cleanlab_qa_pass;

DROP TABLE IF EXISTS cleanlab_label_issue CASCADE;
DROP TABLE IF EXISTS cleanlab_qa_pass CASCADE;
