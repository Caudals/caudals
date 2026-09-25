# Evaluation platform runbooks

Operational procedures required by spec §17.6. Every procedure runs on `caudals-1` as a founder with approved Tailscale access. Never paste secrets, customer content or private endpoints into tickets, chat or commits. Alerts arrive from `caudals-evals-health.timer` (every ten minutes) at the collaboration notification inbox; each names the condition, not the data.

Common commands:

```sh
sudo docker service ls                                   # all services 1/1?
sudo docker service logs --since 30m caudals-evals_worker # redacted JSON events only
sudo CAUDALS_ALERT_DRY_RUN=true /usr/local/sbin/caudals-evals-health
sudo systemctl start caudals-evals-backup.service        # take a backup now
```

Pause dispatch for a whole service with `sudo docker service scale caudals-evals_worker=0` (or `_browser`, `_scheduler`). Durable jobs stay in the queue; nothing is lost.

## 1. DGX down

Signals: `dgx_unreachable` or `provider_unhealthy`; preparation shows "paused"; `/ops/platform/inference` shows `circuit_open`.

1. Confirm from the host: the alert already tested the private route. Check the WireGuard interface with `ip -d link show dgxspark` and the DGX itself (power, Ollama service).
2. Do nothing to queued work. The worker opens the circuit and requeues after 30 s; generation and judge steps pause instead of failing.
3. Never switch internal generation or judging to a commercial provider silently. A cloud fallback requires the workspace's data policy to allow it and a recorded route change in Providers & models.
4. When the DGX answers again, run a text probe from Providers & models; the circuit closes on the next healthy call.

## 2. Provider key expired or revoked

Signals: attempts fail with `auth` reasons; provider health not healthy.

1. In Providers & models, rotate the key (write-only; a new version is appended). Rotation clears the unhealthy state so the next call probes it.
2. Revoked keys stay revoked; there is no automatic retry of bad credentials.
3. For a customer target credential, the workspace owner rotates it in Systems → Credentials; reruns follow the new system version automatically.

## 3. Website recipe drift

Signals: browser runs end `capture_incomplete` or the connection enters `needs_operator`.

1. Do not let a model click new controls during a paid run. Scored runs already refuse text-stability-only completion.
2. Open the system, review the failed probe evidence, and submit a corrected declarative recipe (operator only). It must pass two fresh-context reset probes before a new immutable recipe revision is frozen.
3. Start a new run on the new revision; earlier runs keep their original revision and are not compared naively.

## 4. Worker crash mid-call

Signals: `lease_expired`, `unresolved_attempts`.

1. A reserved-but-undispatched attempt releases its reservation automatically when the lease expires and may retry within three attempts.
2. A dispatched attempt becomes `unknown`: its liability and DGX residency slot are kept and it is never replayed.
3. Reconcile each unknown attempt: find the provider's record (request ID in the attempt) or, for zero-price DGX calls, record `0`. Upload a short evidence note as a source artifact, then run
   `echo '{"attemptId":"…","actual":"0","evidenceId":"…"}' | sudo docker run --rm -i … services/evals-worker/admin.sh reconcile` with the admin credentials (see `docs/evals/work-packages/WP-03.md`).
4. If the call must happen again, start a deliberate new run; reconciliation never requeues the old step.

## 5. Budget mismatch

Signals: `budget_pauses`, a customer reports "paused at the agreed limit", or settled spend differs from an invoice.

1. Inspect Usage & budgets for the workspace: settled, reserved and unresolved amounts are separate.
2. If the cap is right, tell the customer: completed work is preserved and the run can resume after scope reduction.
3. If a higher cap is agreed, amend it in Usage & budgets with a reason (evaluation caps above €1,000 need a founder decision, D-03). Amendments are immutable and audited.
4. For invoice differences, record the reconciled amount on the affected unknown attempts (runbook 4). Never edit cost rows.

## 6. Invalid answer key discovered after publication

1. Dispute the affected results in the Review queue with the reason; this appends a decision and keeps the original.
2. Correct the case in the test set; editing creates a new revision and requires a new frozen suite version.
3. Regrade stored outputs (`POST /runs/:id/score` with a new grader revision) or rerun on the new suite; do not call the target just to regrade.
4. Create a new report revision and publish it; the previous revision becomes superseded. If shared, revoke the old share and share the new revision. Tell the customer what changed.

## 7. Tenant-access incident

1. Contain first: scale the app to 0 only if data is actively leaking; otherwise revoke the affected shares and credentials from the report and Systems screens.
2. Preserve evidence: take a backup now and export `evals.audit_event` and `evals.share_access_event` for the window.
3. Identify scope from the audit log (Platform → Audit log) and share access events; determine which workspaces and objects were read.
4. Fix the defect with a regression test that reproduces the cross-tenant read, deploy, and notify affected customers as required by contract and law.

## 8. Source deletion or rights expiry

1. Remove the source from future test sets by creating new case revisions without it; frozen suites are not edited.
2. For reports that relied on it, create a new report revision whose limitations state the evidence change, or withdraw the report. Published snapshots only carry minimal redacted excerpts.
3. For a whole-workspace request, use Settings → Delete workspace data (owner). Access stops at once; the lifecycle worker deletes objects, withdraws reports and leaves a tombstone and ledger entry.

## 9. Backup restore

1. Keep workers paused: scale `caudals-evals_worker`, `_browser`, `_scheduler` and `_documents` to 0 before restoring.
2. Decrypt the chosen `caudals-daily-*.tar.gz.gpg` with the root-only passphrase into a private directory; verify `MANIFEST.sha256`.
3. Restore `globals.sql`, then each database dump, into a disposable PostgreSQL first; restore `object-store.tar.gz` into an isolated MinIO and compare object counts. `sudo scripts/evals/restore-rehearsal.sh` does the database part against the newest archive in a network-less container and removes it afterwards. The dump recreates the `pg_cron` extension, so the restore server must start with `-c shared_preload_libraries=pg_cron -c cron.database_name=caudals`.
4. Replay newer deletions and revocations before serving any read: decrypt `recovery-control-ledger-latest.csv.gpg` and run `npm run evals:recovery-rehearsal -- <snapshot-UTC>` with dispatch disabled.
5. Reconcile unknown attempts and reservations (runbook 4) before re-enabling any worker, so no paid call is replayed.

## 10. Full VPS recovery

1. Provision a new host with Docker Swarm, Tailscale and the WireGuard DGX route; recreate the Docker networks from `scripts/provision-evals-production.sh`.
2. Restore the encrypted backup (runbook 9). The off-host copy exists only when `CAUDALS_BACKUP_OFFHOST_TARGET` is configured; until a destination is approved, a lost disk means the local archives are lost too.
3. Recreate Docker secrets from the restored root-only state, deploy the app and evaluation stacks by image digest, and keep workers at 0 until runbook 9 steps 4–5 pass.
4. Run the public, app and Leads health checks and a synthetic evaluation before re-enabling customer workspaces.

Recovery objectives (RPO 24 h, RTO 8 h) are targets validated only by a restore rehearsal; record each rehearsal in `work-packages/WP-08.md`.
