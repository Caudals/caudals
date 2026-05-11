-- Runtime extensions required by the Phase 1 PostgreSQL target.
-- pg_cron requires shared_preload_libraries and cron.database_name at server start.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_cron;
