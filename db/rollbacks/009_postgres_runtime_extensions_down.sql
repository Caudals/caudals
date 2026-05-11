-- Rollback for db/migrations/009_postgres_runtime_extensions.sql.

DROP EXTENSION IF EXISTS pg_cron;
DROP EXTENSION IF EXISTS pg_trgm;
