-- Rollback for db/migrations/114_evals_public_result_pages.sql: drops the
-- listing function. No table or row is touched.
BEGIN;
DROP FUNCTION IF EXISTS evals.public_result_pages(integer);
DELETE FROM public.evals_migration_history WHERE name = '114_evals_public_result_pages.sql';
COMMIT;
