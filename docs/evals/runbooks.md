# Evaluation platform runbooks

Operational procedures required by spec §17.6 and launch package L-08 (spec P-43, P-48). Every procedure runs on `atlantic` as a founder with approved Tailscale access. Never paste secrets, customer content or private endpoints into tickets, chat or commits.

Three signals reach the collaboration notification inbox, and each names the condition, not the data:

- **Platform alerts** from `caudals-evals-health.timer` on atlantic (every ten minutes, `scripts/evals/health-alerts.sh`). Every alert line links to its section below.
- **Uptime alerts** from `caudals-uptime.timer` (every minute, `scripts/uptime-checks.sh`), outside the host that serves the site: see runbook 19.
- **Errors in Sentry** from the web app and the worker, scheduler and document services, scrubbed of personal data: see runbook 20.

Common commands:

```sh
sudo docker service ls                                   # all services 1/1?
sudo docker service logs --since 30m caudals-evals_worker # redacted JSON events only
sudo CAUDALS_ALERT_DRY_RUN=true /usr/local/sbin/caudals-evals-health          # what would alert now (sends nothing)
sudo CAUDALS_ALERT_DRILL=all /usr/local/sbin/caudals-evals-health   # alert drill
sudo systemctl list-timers 'caudals-*' --no-pager
sudo systemctl start caudals-evals-backup.service        # take a backup now
```

Pause dispatch for a whole service with `sudo docker service scale caudals-evals_worker=0` (or `_browser`, `_scheduler`). Durable jobs stay in the queue; nothing is lost.

## Workspace evaluation queue

When the workspace's active-run allowance is occupied, new evaluations enter a durable FIFO queue. Workers retry admission after five seconds without creating target attempts or reserving spend. Completion, cancellation and a fully paused run release the slot; pause or cancellation with calls still draining retains it. Resuming a paused run joins the back of the queue. Disabled allowances and exhausted budgets retain their existing guards.

Keep admission-aware workers when rolling back another part of the release. Before reverting to workers or private-runner endpoints that predate queue admission, stop general and browser dispatch and private-runner acquisition, then drain or cancel waiting evaluations. Retain migration `073_evals_run_queue.sql` and its additive grants; reverting only the application does not remove the queue schema.

Production acceptance on 2026-10-04 used release `9644eb80c7ab74b0c9d5eed94cbe0da39f629ad0`: two evaluations against the owned synthetic endpoint remained queued with zero target attempts while a slot was occupied, then automatically completed target execution in FIFO order after release. There were no paid provider calls or spend. Internal grading was excluded by a zero budget, and the synthetic workspace and credentials were retired after verification.

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

Signals: a browser run pauses with `capture_incomplete`, `website_selector_failed` or `browser_session_unavailable`, or the connection enters `needs_operator`.

A single missed reply never gets here: each website test is retried three times in a fresh browser, and a test that still fails is recorded as not captured while the run continues. A run pauses only when the login expired, the last three finished tests failed, or nothing was captured after two tests. The customer can **Resume** (transient outage) or **Finish and grade N answers** (partial report) from the evaluation page.

1. Do not let a model click new controls during a paid run. Scored runs already refuse text-stability-only completion.
2. Open the system, review the failed probe evidence, and submit a corrected declarative recipe (operator only). It must pass two fresh-context reset probes before a new immutable recipe revision is frozen.
3. Start a new run on the new revision; earlier runs keep their original revision and are not compared naively.

## 4. Worker crash mid-call

Signals: `lease_expired`, `unresolved_attempts`.

1. A reserved-but-undispatched attempt releases its reservation automatically when the lease expires and may retry within three attempts.
2. A dispatched call to a customer's API becomes `unknown`: its liability is kept and it is never replayed. Two exceptions repeat by themselves within three attempts: an internal engine call (generation, judging, report writing), whose possible charge stays unresolved and whose provider slot is released; and a website test, which has no external charge and runs again in a fresh browser. Generation also re-queues a step after a provider failure, an incomplete or invalid answer (with a corrective note, or a smaller request when the output ran out), at most four calls per profile or drafting round. Any other unknown DGX attempt keeps the residency slot until reconciled; a commercial API attempt releases its concurrency slot 15 minutes after it ended, so timed-out calls cannot block the route.
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

## 11. Disk or memory pressure

Signals: `disk_pressure` (root disk at 85 % or more), `memory_pressure` (less than 400 MiB available).

1. `df -h /`, `sudo docker system df` and `free -m`. The hourly `caudals-docker-cleanup.timer` removes only images no service runs or would roll back to; run it now with `sudo systemctl start caudals-docker-cleanup.service`.
2. Never prune volumes, secrets or the images a running service could roll back to. Old `/root/.caudals/backups` archives follow the backup retention in `scripts/evals/backup.sh`; do not delete the newest.
3. For memory, check `sudo docker stats --no-stream` for a service above its limit; reduce `EVALS_BROWSER_REPLICAS` or demo concurrency before touching anything else.

## 12. Service not converged

Signals: `service_<name>` ("Service X is at 0/1").

1. `sudo docker service ps --no-trunc <name>` shows why the task stopped; `sudo docker service logs --since 30m <name>` has redacted events only.
2. A failed update rolls back on its own. If the service stays down, redeploy the last verified image (app: `docs/launch/AGENT-BRIEF.md` §7; workers: `scripts/deploy-evals-production.sh` with the previous `EVALS_IMAGE_COMMIT`).

## 13. Queue age

Signals: `queue_stuck` (outbox deliveries older than 15 minutes), `lease_expired`, `engine_queue_stale` (pg-boss jobs waiting more than 15 minutes to start).

1. Is the worker running (`caudals-evals_worker` 1/1) and is the DGX up (runbook 1)? Most stale queues are a stopped worker or an open DGX circuit.
2. Waiting jobs are durable: restarting the worker (`sudo docker service update --force caudals-evals_worker`) loses nothing.
3. If one workspace's jobs keep failing, pause that evaluation from Ops rather than scaling the worker to 0.

## 14. Report rendering failed

Signals: `report_render_failed`. The document worker also sends the exception to Sentry (runbook 20).

1. Check `caudals-evals_documents` health and its last log lines; Chromium needs its `/tmp` tmpfs.
2. Retry by requesting the export again from the report; a failed job never blocks the report itself.

## 15. Demo failures or queue

Signals: `demo_failure_rate` (more than 20 % of demos finished in the last hour failed for service reasons, with at least three finished), `demo_queue_stale` (a demo waiting more than 15 minutes).

Visitor-side failures (a site that is unreachable, blocked, thin or has no chat) do not count. Service causes are model errors and timeouts, phase timeouts, browser failures and queue time-outs.

1. Read the reasons: `/ops/growth` → Demo outcomes, or as the database owner `SELECT error_code, count(*) FROM demo.run WHERE finished_at > now()-interval '1 hour' GROUP BY 1`.
2. `model_*` and `timeout_*`: the DGX is down or saturated (runbook 1). The demo page already tells visitors (service notice "degraded" or "at capacity") and the queue holds new runs. Enable the paid fallback only if the founder funded it (`DEMO_FALLBACK_ENABLED`, L-03 handoff).
3. Browser failures: check `caudals-evals_browser` and its egress proxy (runbook 12).
4. A stale queue with healthy models means admission stopped: restart the app (`sudo docker service update --force caudals-app_app`); queued runs keep their place.

## 16. Webhook failures

Signals: `webhook_failures` (outbound customer webhooks that ended failed in the last hour, and failed payment events once L-12's `billing.stripe_event` exists); the uptime check `webhook_health` (runbook 19).

1. Outbound failures are usually the customer's endpoint (HTTP errors, redirects refused). Check the endpoint's recent deliveries in the workspace's integrations screen; tell the customer if their receiver is down. Deliveries retry five times with backoff.
2. Many endpoints failing at once means our side: check `caudals-evals_scheduler` and outbound network from atlantic.
3. `GET https://app.caudals.com/api/evals/v1/health/webhooks` names failing checks (`database`, `outbound_signing`, `stripe`) without details. `outbound_signing` failing means the webhook keyring secret is missing or unreadable in the app service. `stripe` failing means `STRIPE_SECRET_KEY` does not match `BILLING_STRIPE_MODE`, that mode's signing secret (`STRIPE_TEST_WEBHOOK_SECRET` or `STRIPE_LIVE_WEBHOOK_SECRET`) is missing, or a Stripe event has stayed unprocessed for 15 minutes (`SELECT id, type, deliveries, received_at FROM billing.stripe_event WHERE status='received' ORDER BY received_at`).
4. Payment webhooks (L-12): a signing-secret mismatch fails every event (`billing_webhook_signature_failed` in the app log); fix the secret (docs/TOOLS.md → Stripe Credit Top-ups), then replay the failed events from the Stripe dashboard (test mode until Gate B). Event handling is idempotent, so replays never double-credit. Failed events: `SELECT type, outcome, count(*) FROM billing.stripe_event WHERE status='failed' AND received_at > now()-interval '1 day' GROUP BY 1,2`; `payment_mismatch` is permanent and needs ops (the payment does not match its order), `order_not_paid` resolves itself when Stripe redelivers.

## 17. Billing incident

Signals: `holds_stale` (credit holds unresolved after 24 hours), `billing_shadow_drift` (the daily shadow credit report found mismatches; L-11), a `billing_drift` line from the scheduler's daily verification, a `billing_shadow_error` log line from a worker, a run paused with `credits_exhausted` that should not be, a customer charged for failed work, or any doubt about a balance.

Shadow drift: print the day's diff with `scripts/billing/shadow-report.ts` (`docs/TOOLS.md`), find the failing check, and explain it before enforcement is switched on. Shadow mode never changes a balance or a run, so there is nothing to refund.

1. Contain: set `BILLING_ENFORCE=shadow` (`scripts/launch/set-app-flag.sh BILLING_ENFORCE shadow`, then redeploy the workers) so no run is refused while you investigate. Never switch `BILLING_CREDITS_ENABLED` off mid-incident without reading L-09.md: it stops ledger writes.
2. Never edit ledger rows: entries are append-only and every correction goes through `billing.adjust`, `billing.release` or `billing.refund_run` with a reason and an idempotency key.
3. Stale holds: find them with `SELECT org_id, run_id, attempt_id, created_at FROM billing.credit_hold WHERE state='held' AND created_at < now()-interval '24 hours'`. Reconcile the attempt first (runbook 4), then release or capture through the engine path; the daily expiry releases holds past `expires_at`.
4. Drift: run the verifier (L-09.md) and compare account balances with the ledger sum; record the explanation before any adjustment.
5. Recent sign-in is required for every billing action (`requireRecentSignIn`); admins confirm with password and TOTP.
6. Tell affected customers what happened and what was refunded; record the incident in the package handoff or `docs/launch/PROGRESS.md`.

## 18. Database unreachable

Signals: `database_down`, `database_unreadable`.

1. `sudo docker service ps caudals-postgres_db`; the service restarts on failure. Check disk (runbook 11) first: a full disk stops PostgreSQL.
2. Do not restart workers until the database answers; their jobs resume from durable state.

## 19. Uptime check failed

Signals: "Caudals uptime alert" emails for `landing`, `demo_api`, `app_sign_in`, `auth_api` or `webhook_health`, sent by `caudals-uptime.timer` every minute. A check fails only when two attempts five seconds apart both fail, so a real outage alerts within about 90 seconds; reminders follow every six hours while it stays down, and a RESOLVED email when it answers again.

1. Open the URL in the alert from your phone. Landing and demo API down together usually means the app or Traefik; only `webhook_health` means a webhook dependency (runbook 16).
2. `sudo docker service ps caudals-app_app` and `curl -sI https://caudals.com/en`. A failed deploy rolls back by itself; otherwise redeploy the previous image (`docs/launch/AGENT-BRIEF.md` §7).
3. If atlantic itself is unreachable, check Hetzner's console; Cloudflare keeps serving errors meanwhile.

Where it runs: the decision is arctic (I-5), a different host and provider, installed with `sudo scripts/install-uptime-checks.sh` (alert routing from `/root/.caudals/alerts.env`). Until that is done, an interim copy runs on atlantic, which cannot report atlantic's own outage. After the arctic install, disable the interim one with `sudo systemctl disable --now caudals-uptime.timer` on atlantic.

Drill: `echo landing | sudo tee /root/.caudals/uptime-drill`, wait for the alert, then `sudo rm /root/.caudals/uptime-drill` and wait for the RESOLVED email. The drilled check requests a path that does not exist, so the failure travels the real network path.

## 20. Errors in Sentry

The web app (`service:web`) and the worker, scheduler and document services (`service:evals-*`) report unexpected errors to Sentry with the deployed commit as the release. The browser executor has no direct egress by design and does not report. Every event passes `lib/observability/sentry-scrub.mjs`: no users, IP addresses, cookies, headers, query strings, bodies, local variables, emails, phone numbers or tokens.

1. Each web event has a `request_id` tag that matches the `eval_api_request_failed` log line: `sudo docker service logs --since 1h caudals-app_app | grep <request_id>`.
2. Status: `sudo docker exec <app container> npm run observability:sentry-status -- --fail-on-disabled`. Test event (fake personal data that must arrive redacted): add `--send-test-event`; from a worker container, `node --conditions=react-server --import tsx services/evals-worker/sentry-test.ts`.
3. Rotate the DSN: write the new one to `/root/.caudals/secrets/sentry-dsn` (root, mode 600), then `sudo scripts/configure-sentry-runtime.sh`; the next deploys keep it.

## 21. Admin two-factor authentication

Platform admins, platform operators and workspace operators must use TOTP once `EVALS_ADMIN_MFA_REQUIRED=true`; customers may turn it on from Account security (`/workspace/security`). Enforcement stays off until every staff account has enrolled (PROGRESS.md I-6).

1. Enrolment status, as the database owner: `SELECT p.role, u.email, u."twoFactorEnabled" FROM evals.platform_role p JOIN auth_user u ON u.id=p.user_id UNION ALL SELECT 'workspace operator', u.email, u."twoFactorEnabled" FROM evals.membership m JOIN auth_user u ON u.id=m.user_id WHERE m.role='operator'`.
2. Turn enforcement on only when every row is `t`: `scripts/launch/set-app-flag.sh EVALS_ADMIN_MFA_REQUIRED true`. Staff without TOTP are then sent to the setup page at their next page load and APIs answer `MFA_ENROLMENT_REQUIRED`; staff cannot turn TOTP off while it is required. To undo, set it to `false`.
3. Lost authenticator: sign in with a recovery code (each works once), then create new codes or set TOTP up again from Account security.
4. Lost authenticator and recovery codes: after confirming the person's identity out of band, a founder on atlantic resets them as the database owner, in one transaction: `DELETE FROM auth_two_factor WHERE "userId"=$1; UPDATE auth_user SET "twoFactorEnabled"=false WHERE id=$1; DELETE FROM auth_session WHERE "userId"=$1;` and `INSERT INTO evals.audit_event(actor_id,action,subject_id) VALUES(<founder user id>,'security.two_factor_reset',$1)`. With enforcement on, the person must enrol again at their next sign-in.
5. Ten wrong codes in a row lock verification for 15 minutes (`auth_two_factor."lockedUntil"`, migration 107). Sign-in is also limited to 20 attempts per visitor and 10 per account every 15 minutes, and two-factor checks to 20 per visitor.

## 22. Invoicing backlog

Signal: `invoicing_stalled` (an invoice or rectifying-invoice request has stayed `queued` for an hour after a provider failure, or for a day without any attempt). Launch L-13; docs/TOOLS.md → Invoicing.

1. What is stuck: `SELECT kind, livemode, attempts, last_error_code, next_attempt_at, created_at FROM billing.invoice_document WHERE status='queued' ORDER BY created_at` (as `postgres`).
2. No attempts at all: invoicing is off. Check `BILLING_INVOICING_PROVIDER` in the app credentials and on the scheduler (`sudo docker service inspect caudals-evals_scheduler --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}' | tr ',' '\n' | grep INVOICING`); set it to `manual` with `scripts/launch/set-app-flag.sh` and redeploy the workers.
3. Attempts with an error code: the provider refused or was down. `provider_unavailable`/`provider_error` retry by themselves (backoff up to an hour); `original_not_issued` waits for the original invoice; anything else (`customer_invalid`, `wrong_document_kind`…) needs the request's data or the adapter fixed. The scheduler's `billing_invoicing_failed` lines name the document.
4. Never edit document rows or make up a number. With the manual adapter, the accountant issues pending requests from the monthly export and ops attach number and PDF through `POST /api/evals/v1/billing/admin/invoices/:id`.

## 23. Billing reconciliation and price notices

Signals: `billing_reconciliation` (the latest daily reconciliation report has unexplained differences; L-16), a `billing_reconciliation_mismatch` line from the scheduler, `price_notice_due` (a price-book revision raises prices and its 30-day notice is due within a week, or was missed). docs/TOOLS.md → Ops billing console.

Reconciliation (every day at 05:00 UTC for the previous UTC day, and at scheduler start; Gate B needs three clean days in a row):

1. Open `/ops/platform/billing?view=reconciliation`. Each failing check lists up to 20 ids. Or, as `postgres`: `SELECT day, discrepancies, report->'checks' FROM billing.reconciliation_report ORDER BY generated_at DESC LIMIT 1`.
2. Stripe side: *missing in Stripe* or *different amount* for an order means Stripe and our order disagree — open the PaymentIntent in the Stripe dashboard (test or live per the report). *Payments whose order got no credits* means a payment succeeded but the webhook was not processed: check `billing.stripe_event` and runbook 16, then let Stripe resend the event (or the return page's sync) — never credit by hand. *Settled on another day* and *not a Caudals order* are explained notes.
3. Database side: `paid_order_purchase_mismatch`, `purchase_without_paid_order`, refund and chargeback checks point at an order and its ledger entries (`/ops/platform/billing?view=accounts&org=<workspace>`); invoice checks at `billing.invoice_document` (runbook 22); `holds_open_over_25h` at runbook 17 step 3; `inconsistent_accounts` at the verifier (runbook 17 step 4); `shadow_drift` at the shadow report.
4. Correct only through the console's audited actions (adjust, reverse, refund) with a reason that names the report day; never edit ledger or order rows. Large corrections need a second admin.
5. Re-run the day from the console (Reconcile this day) to confirm zero; the alert resolves with the next clean report. Record the explanation in the incident note.

Price notices (§6.4): a revision that raises any rate takes effect only if its notice went out at least 30 days before its date; otherwise the previous revision stays in effect (we absorb the provider's increase).

1. Due: open the revision under Price book, check the increases and recipients, send a test (internal address), then — with `BILLING_PRICE_NOTICES=owners`, a founder decision — Send the notice before the deadline.
2. Missed: the revision is held. Cancel it (allowed for a held revision) and schedule it again at least 30 days after the notice you will send. The alert stays open until then.

## Alert drills

Each alert must fire once in a drill and link to its runbook (L-08 acceptance).

- Platform alerts: `sudo CAUDALS_ALERT_DRILL=all /usr/local/sbin/caudals-evals-health` sends one email marked "(drill)" that opens every launch alert (demo failure rate, demo and engine queue age, DGX, disk, webhook failures, stale holds, shadow drift, invoicing backlog), each with its runbook link. Since L-16 it also opens the billing reconciliation and price-notice alerts. The next timer run sends RESOLVED. `CAUDALS_ALERT_DRILL=demo_failure_rate,disk_pressure` drills a subset. Detection itself is covered against the real schema by `tests/evals/health-alerts-db.test.ts`.
- Uptime: runbook 19.
- Sentry: runbook 20, step 2.
- The production drills are recorded in `docs/launch/L-08.md`.

