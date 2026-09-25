#!/usr/bin/env bash
# Provision a disposable PostgreSQL 16 database for the evaluation DB fixture
# tests (tests/evals/*-db.test.ts). It applies every repository migration in
# order, the evaluation migrations through the real migrator, and creates a
# non-owner NOBYPASSRLS login that inherits only evals_runtime.
#
#   eval "$(scripts/evals/test-db.sh up)"   # exports EVALS_TEST_* URLs
#   npx vitest run tests/evals/*-db.test.ts
#   scripts/evals/test-db.sh down
#
# Never point these fixtures at a shared or production database.
set -euo pipefail

name="${EVALS_TEST_DB_CONTAINER:-caudals-evals-test-db}"
port="${EVALS_TEST_DB_PORT:-55439}"
image="${EVALS_TEST_DB_IMAGE:-pgvector/pgvector:pg16}"
root="$(cd "$(dirname "$0")/../.." && pwd)"

case "${1:-up}" in
  down)
    docker rm -f "$name" >/dev/null 2>&1 || true
    exit 0
    ;;
  up) ;;
  *) echo "usage: $0 up|down" >&2; exit 2 ;;
esac

docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" -p "127.0.0.1:$port:5432" \
  -e POSTGRES_PASSWORD=owner -e POSTGRES_DB=caudals --memory 512m "$image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -d caudals >/dev/null 2>&1 && break
  sleep 1
done
psql_owner() { docker exec -i "$name" psql -v ON_ERROR_STOP=1 -q -U postgres -d caudals "$@"; }

psql_owner < "$root/scripts/evals/test-bootstrap.sql" >&2
# Repository migrations before the evaluation series (identity, auth tables).
for file in "$root"/db/migrations/0[0-2][0-9]_*.sql "$root"/db/migrations/030_*.sql; do
  psql_owner < "$file" >/dev/null 2>&1 || echo "note: $(basename "$file") did not apply cleanly on the fixture" >&2
done

# Later evaluation migrations grant to separately provisioned service roles.
# On the fixture they exist as NOLOGIN roles so grants apply exactly as in production.
psql_owner >&2 <<'SQL'
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['evals_worker','evals_document','evals_browser','evals_scheduler','evals_execution_admin','evals_queue'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS', r);
    END IF;
  END LOOP;
END $$;
SQL
owner_url="postgres://postgres:owner@127.0.0.1:$port/caudals"
EVALS_MIGRATION_DATABASE_URL="$owner_url" node --import tsx "$root/scripts/evals/migrate.ts" >&2
# Production reapplies the service grant scripts after migrations.
for grants in worker admin document browser; do
  psql_owner < "$root/infra/evals/$grants-grants.sql" >&2
done
psql_owner >&2 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_test_runtime') THEN
    CREATE ROLE evals_test_runtime LOGIN PASSWORD 'runtime' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE evals_runtime;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_test_admin') THEN
    CREATE ROLE evals_test_admin LOGIN PASSWORD 'admin' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE evals_execution_admin;
  END IF;
END $$;
SQL
echo "export EVALS_TEST_OWNER_URL=$owner_url"
echo "export EVALS_TEST_DATABASE_URL=postgres://evals_test_runtime:runtime@127.0.0.1:$port/caudals"
echo "export EVALS_TEST_ADMIN_URL=postgres://evals_test_admin:admin@127.0.0.1:$port/caudals"
