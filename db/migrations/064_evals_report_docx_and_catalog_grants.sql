-- 1. Model routes resolve through the web runtime: it must see whether a
--    revision is retired and whether its funded account is enabled (never
--    endpoints, keys or limits).
-- 2. Reports can also be downloaded as an editable Word document (.docx),
--    generated from the same immutable snapshot as the PDF.
BEGIN;
GRANT SELECT (account_id, retired_at) ON TABLE evals.provider_revision TO evals_runtime;
GRANT SELECT (id, enabled) ON TABLE evals.provider_account TO evals_runtime;

ALTER TABLE evals.report_artifact DROP CONSTRAINT report_artifact_kind_check;
ALTER TABLE evals.report_artifact ADD CONSTRAINT report_artifact_kind_check
  CHECK (kind IN ('pdf','csv','cef','docx','comparison_pdf','comparison_json'));
COMMIT;
