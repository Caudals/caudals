#!/usr/bin/env bash
set -euo pipefail

# Run as root on the Swarm manager. This creates isolated evaluation service
# identities and a separate queue database. It never prints generated secrets.
if [[ $(id -u) -ne 0 ]]; then
  echo 'Run as root on the Swarm manager' >&2
  exit 1
fi

repo_dir=$(cd "$(dirname "$0")/.." && pwd)
state_dir=/root/.caudals/evals-production
install -d -m 0700 "$state_dir"
postgres_container=$(docker ps --filter 'label=com.docker.swarm.service.name=caudals-postgres_db' --format '{{.ID}}' | head -n1)
[[ -n $postgres_container ]] || { echo 'Production PostgreSQL is not running' >&2; exit 1; }

if [[ ! -e $state_dir/pre-provision-evals.dump ]]; then
  docker exec --user postgres "$postgres_container" pg_dump -U postgres -d caudals -Fc -n evals > "$state_dir/pre-provision-evals.dump"
  chmod 0600 "$state_dir/pre-provision-evals.dump"
fi

for role in evals_worker evals_document evals_execution_admin evals_scheduler evals_queue; do
  if docker exec --user postgres "$postgres_container" psql -U postgres -d caudals -Atqc "SELECT 1 FROM pg_roles WHERE rolname='$role'" | grep -qx 1; then
    [[ -s $state_dir/$role.password ]] || { echo "Existing $role has no matching protected password file" >&2; exit 1; }
    continue
  fi
  password=$(openssl rand -hex 32)
  printf '%s' "$password" > "$state_dir/$role.password"
  chmod 0600 "$state_dir/$role.password"
  printf "CREATE ROLE %s LOGIN PASSWORD '%s' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;\n" "$role" "$password" |
    docker exec -i --user postgres "$postgres_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d caudals -q
  unset password
done

# Scheduled run creation uses the same tenant-checked repository path as the
# app, in a separate process without target/provider credentials.
docker exec --user postgres "$postgres_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d caudals -qc \
  'GRANT evals_runtime TO evals_scheduler'

if ! docker exec --user postgres "$postgres_container" psql -U postgres -d caudals -Atqc "SELECT 1 FROM pg_database WHERE datname='caudals_evals_queue'" | grep -qx 1; then
  docker exec --user postgres "$postgres_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d caudals -qc \
    'CREATE DATABASE caudals_evals_queue OWNER evals_queue'
fi

for grants in worker document admin; do
  docker exec -i --user postgres "$postgres_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d caudals -q \
    < "$repo_dir/infra/evals/$grants-grants.sql"
done

write_secret() {
  local name=$1 file=$2
  if ! docker secret inspect "$name" >/dev/null 2>&1; then
    docker secret create "$name" "$file" >/dev/null
  fi
}

for role in evals_worker evals_document evals_execution_admin evals_scheduler evals_queue; do
  database=caudals
  [[ $role == evals_queue ]] && database=caudals_evals_queue
  printf 'postgresql://%s:%s@caudals-postgres:5432/%s' "$role" "$(cat "$state_dir/$role.password")" "$database" \
    > "$state_dir/$role.url"
  chmod 0600 "$state_dir/$role.url"
  write_secret "caudals_${role}_database_url" "$state_dir/$role.url"
done

if [[ ! -e $state_dir/master-keyring.json ]]; then
  printf '{"v1":"%s"}\n' "$(openssl rand -base64 32)" > "$state_dir/master-keyring.json"
  chmod 0600 "$state_dir/master-keyring.json"
fi
write_secret caudals_evals_master_keyring "$state_dir/master-keyring.json"

if [[ ! -e $state_dir/webhook-keyring.json ]]; then
  printf '{"v1":"%s"}\n' "$(openssl rand -base64 32)" > "$state_dir/webhook-keyring.json"
  chmod 0600 "$state_dir/webhook-keyring.json"
fi
write_secret caudals_evals_webhook_keyring "$state_dir/webhook-keyring.json"

if [[ ! -e $state_dir/dgx-endpoint ]]; then
  printf '%s\n' 'http://192.168.70.19:11434/v1' > "$state_dir/dgx-endpoint"
  chmod 0600 "$state_dir/dgx-endpoint"
fi
write_secret caudals_evals_dgx_endpoint "$state_dir/dgx-endpoint"

echo 'Evaluation service roles, isolated queue database, and Swarm secrets are provisioned.'
