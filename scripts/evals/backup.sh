#!/usr/bin/env bash
# Daily encrypted backup for caudals-1 (spec §17.5), run by
# caudals-evals-backup.timer. Captures, consistently enough for RPO 24 h:
#   - the application databases (caudals, caudals_evals_queue, caudals_leads, postiz),
#   - PostgreSQL global roles (needed to restore least-privilege service logins),
#   - the private object store volume,
#   - the recovery-control ledger as an independent file (replayed after restore).
# The archive is AES-256 encrypted with the root-only local passphrase and kept
# for $retention_days days. If CAUDALS_BACKUP_OFFHOST_TARGET is configured
# (rclone remote or rsync destination), the encrypted archive is also copied
# off-host; that destination is an explicit founder decision and is not assumed.
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run as root on caudals-1" >&2; exit 1; }
backup_dir="${CAUDALS_BACKUP_DIR:-/root/.caudals/backups}"
passphrase_file="${CAUDALS_BACKUP_PASSPHRASE_FILE:-/root/.caudals/evals-production/local-backup-passphrase}"
retention_days="${CAUDALS_BACKUP_RETENTION_DAYS:-7}"
databases=(caudals caudals_evals_queue caudals_leads postiz)
volume="${CAUDALS_BACKUP_OBJECT_VOLUME:-caudals-object-storage-minio-data}"
[[ -s $passphrase_file ]] || { echo "Missing backup passphrase file" >&2; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d /root/.caudals/backup-work.XXXXXX)
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
pg=$(docker ps -q -f name=caudals-postgres_db | head -n1)
[[ -n $pg ]] || { echo "PostgreSQL container not found" >&2; exit 1; }

for db in "${databases[@]}"; do
  if docker exec "$pg" psql -U postgres -Atc "select 1 from pg_database where datname='$db'" | grep -q 1; then
    docker exec "$pg" pg_dump -U postgres -d "$db" -Fc > "$work/$db.dump"
  fi
done
docker exec "$pg" pg_dumpall -U postgres --globals-only > "$work/globals.sql"
docker exec "$pg" psql -U postgres -d caudals -c \
  "\\copy (SELECT id,org_id,action,subject_type,subject_id,occurred_at,actor_id,payload_hash FROM evals.recovery_control_event ORDER BY id) TO STDOUT WITH CSV HEADER" \
  > "$work/recovery-control-ledger.csv"
mountpoint=$(docker volume inspect "$volume" --format '{{.Mountpoint}}' 2>/dev/null || true)
if [[ -n $mountpoint && -d $mountpoint ]]; then
  tar -C "$mountpoint" -czf "$work/object-store.tar.gz" .
fi
(cd "$work" && sha256sum ./* > MANIFEST.sha256)

archive="$backup_dir/caudals-daily-$stamp.tar.gz.gpg"
install -d -m 700 "$backup_dir"
tar -C "$work" -czf - . | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
  --passphrase-file "$passphrase_file" -o "$archive"
chmod 600 "$archive"
sha256sum "$archive" | cut -d' ' -f1 > "$archive.sha256"
# Verify the archive decrypts and lists before trusting it.
gpg --batch --quiet --decrypt --passphrase-file "$passphrase_file" "$archive" | tar -tzf - >/dev/null
# Keep the newest ledger as its own encrypted file so a restore from an older
# archive can still replay later deletions and revocations first.
gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$passphrase_file" \
  -o "$backup_dir/recovery-control-ledger-latest.csv.gpg" "$work/recovery-control-ledger.csv"
chmod 600 "$backup_dir/recovery-control-ledger-latest.csv.gpg"

if [[ -n ${CAUDALS_BACKUP_OFFHOST_TARGET:-} ]]; then
  if command -v rclone >/dev/null && [[ $CAUDALS_BACKUP_OFFHOST_TARGET == *:* && $CAUDALS_BACKUP_OFFHOST_TARGET != */* ]]; then
    rclone copy "$archive" "$CAUDALS_BACKUP_OFFHOST_TARGET" && rclone copy "$archive.sha256" "$CAUDALS_BACKUP_OFFHOST_TARGET"
  else
    rsync -a "$archive" "$archive.sha256" "$CAUDALS_BACKUP_OFFHOST_TARGET/"
  fi
  echo "offhost_copy=ok"
fi

find "$backup_dir" -maxdepth 1 -name 'caudals-daily-*.tar.gz.gpg*' -mtime +"$retention_days" -delete
printf 'backup=%s bytes=%s\n' "$(basename "$archive")" "$(stat -c %s "$archive")"
