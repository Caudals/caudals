#!/usr/bin/env bash
# Restore rehearsal: decrypts the newest daily archive into a private directory,
# verifies its manifest, restores it into a disposable PostgreSQL with no network,
# and compares counts. Never touches production services or data.
# Usage: sudo scripts/evals/restore-rehearsal.sh   (see docs/evals/runbooks.md §9)
set -euo pipefail
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run as root on caudals-1" >&2; exit 1; }
archive=$(ls -1t /root/.caudals/backups/caudals-daily-*.tar.gz.gpg | head -1)
work=$(mktemp -d /root/.caudals/restore-rehearsal.XXXXXX); chmod 700 "$work"
name=caudals-restore-rehearsal
trap 'docker rm -f $name >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
[[ $(sha256sum "$archive" | cut -d" " -f1) == $(cat "$archive.sha256") ]] || { echo "archive_checksum=mismatch" >&2; exit 1; }
echo "archive_checksum=ok"
gpg --batch --quiet --decrypt --passphrase-file /root/.caudals/evals-production/local-backup-passphrase "$archive" | tar -C "$work" -xzf -
(cd "$work" && sha256sum -c --quiet MANIFEST.sha256)
echo "manifest=ok"
img=$(docker inspect $(docker ps -qf name=caudals-postgres_db | head -1) --format '{{.Config.Image}}')
pw=$(openssl rand -hex 16)
# pg_cron is not preloaded in production, but restoring its extension needs these settings.
docker run -d --name $name --network none -e POSTGRES_PASSWORD=$pw -v "$work:/restore:ro" "$img" postgres -c shared_preload_libraries=pg_cron -c cron.database_name=caudals >/dev/null
for i in $(seq 1 60); do docker exec $name pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec $name psql -X -q -U postgres -f /restore/globals.sql >/dev/null 2>"$work/globals.err" || true
echo "globals_roles=$(grep -c "^CREATE ROLE" "$work/globals.sql") globals_stderr=$(head -c 300 "$work/globals.err" | tr "\n" " ")"
for db in caudals caudals_evals_queue; do
  docker exec $name createdb -U postgres "$db" 2>/dev/null || true
  docker exec $name pg_restore -U postgres -d "$db" --exit-on-error "/restore/$db.dump" && echo "restore_$db=ok"
done
q="SELECT (SELECT count(*) FROM public.evals_migration_history),(SELECT count(*) FROM evals.workspace),(SELECT count(*) FROM evals.run),(SELECT count(*) FROM evals.observation),(SELECT count(*) FROM evals.assessment),(SELECT count(*) FROM evals.report),(SELECT count(*) FROM evals.artifact WHERE state='ready'),(SELECT count(*) FROM evals.recovery_control_event)"
echo "restored_counts=$(docker exec $name psql -X -U postgres -d caudals -Atc "$q")"
echo "roles_nobypass=$(docker exec $name psql -X -U postgres -Atc "SELECT string_agg(rolname||':'||rolbypassrls,',') FROM pg_roles WHERE rolname LIKE 'evals_%'")"
echo "production_now=$(docker exec $(docker ps -qf name=caudals-postgres_db | head -1) psql -X -U postgres -d caudals -Atc "$q")"
objs=$(tar -tzf "$work/object-store.tar.gz" | grep -vc '/$' || true)
echo "object_store_entries=$objs"
echo "archive=$(basename "$archive")"
