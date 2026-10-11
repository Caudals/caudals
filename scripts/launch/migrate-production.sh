#!/usr/bin/env bash
set -euo pipefail

# Applies pending evaluation migrations to production through the
# caudals-postgres container. It follows scripts/evals/migrate.ts exactly: the
# same explicit order, the same checksum history table, the same advisory lock,
# and one transaction per file with the file's own BEGIN/COMMIT removed.
# DRY_RUN=true lists pending files without applying them.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="$(sudo docker ps --filter name=caudals-postgres_db --format '{{.Names}}' | head -n1)"
[[ -n $container ]] || { echo "caudals-postgres container not found" >&2; exit 1; }
psql_exec() { sudo docker exec -i "$container" psql -U postgres -d caudals -X -q -v ON_ERROR_STOP=1 "$@"; }

mapfile -t names < <(grep -oE "'[0-9]{3}_[a-z0-9_]+\.sql'" "$root/scripts/evals/migrate.ts" | tr -d "'")
[[ ${#names[@]} -gt 0 ]] || { echo "No migrations listed in scripts/evals/migrate.ts" >&2; exit 1; }

pending=0
for name in "${names[@]}"; do
  file="$root/db/migrations/$name"
  [[ -f $file ]] || { echo "Missing migration file: $name" >&2; exit 1; }
  hash="$(sha256sum "$file" | cut -d' ' -f1)"
  applied="$(psql_exec -Atc "SELECT sha256 FROM public.evals_migration_history WHERE name='$name'")"
  if [[ -n $applied ]]; then
    [[ $applied == "$hash" ]] || { echo "Checksum mismatch for applied migration: $name" >&2; exit 1; }
    continue
  fi
  pending=$((pending + 1))
  if [[ ${DRY_RUN:-false} == true ]]; then
    echo "Pending: $name"
    continue
  fi
  {
    echo "SELECT pg_advisory_xact_lock(hashtext('caudals-evals-migrations'));"
    sed -E '/^BEGIN;[[:space:]]*$/d; /^COMMIT;[[:space:]]*$/d' "$file"
    echo
    echo "INSERT INTO public.evals_migration_history(name,sha256) VALUES('$name','$hash');"
  } | psql_exec --single-transaction -f - >/dev/null
  echo "Applied $name"
done
[[ $pending -gt 0 ]] || echo "No pending migrations."
