# 2026-04-03 - Phase 34 VPS and Platform Security Hardening Validation

## Scope
- Phase: `P34`
- Tasks validated: `P34-T01`, `P34-T02`, `P34-T03`, `P34-T04`, `P34-T05`, `P34-T06`

## Repo Validation
- [x] `npm run typecheck`
  - Result: PASS
- [x] `npx eslint lib/supabase/admin.ts scripts/verify-stripe-deployment.js`
  - Result: PASS
  - Note: ESLint emitted only an existing `baseline-browser-mapping` staleness notice, not a lint failure.
- [x] `rg -n "debug_tools|api/debug/stripe|api/debug/payment|api/debug/wallet|StripeDebug" app components lib scripts .github Dockerfile --glob '!node_modules'`
  - Result: PASS for removed runtime surfaces; only the hardened verification script still references `/api/debug/stripe` to assert it is not exposed.

## Host Validation
- [x] Public HTTP probes before hardening confirmed exposure:
  - `http://161.35.200.8:3001/project/default` returned `200 OK`.
  - `https://supabase.caudals.com/` returned `307` to `/project/default`.
  - Public raw host ports were reachable on `3000`, `3001`, `5432`, `6543`, `8000`, `8443`, `2377`, `7946`.
- [x] Post-hardening public probes:
  - `https://supabase.caudals.com/` now returns `404`.
  - `https://supabase.caudals.com/auth/v1/health` still returns `401` from Kong without an API key, confirming API routing remains active.
- [x] External socket probe after hardening:
  - Open before final SSH cutover: `22`, `80`, `443`
  - Open after final SSH cutover: `80`, `443`
  - Closed: `22`, `3000`, `3001`, `4000`, `5432`, `6543`, `8000`, `8443`, `2377`, `7946`
- [x] Host service posture:
  - `ufw status verbose` -> active, default deny incoming, `22/tcp` allowed only on `tailscale0`
  - `sshd -T` -> `passwordauthentication no`, `authenticationmethods publickey`, `permitrootlogin without-password`
  - `passwd -S root` -> `root L ...` (password locked)
  - `fail2ban-client status sshd` -> active
  - `systemctl is-active tailscaled` -> active
  - `tailscale status` -> `ubuntu-caudals` active on the tailnet and reachable as `100.92.160.68`
  - `ssh root@ubuntu-caudals 'echo tailscale-ssh-ok'` -> PASS after accepting the host key on a temporary known-hosts file
- [x] Host stability and sensitive file posture:
  - `swapon --show` -> `/swapfile` active with `4G`
  - `sysctl vm.swappiness vm.vfs_cache_pressure` -> `10` and `50`
  - `journalctl --disk-usage` -> reduced to `391.1M`
  - `df -h /` -> `35G` used, `14G` available
  - `docker system df` -> image footprint reduced from `26.53GB` to `20.71GB`
  - `/root/.ssh` -> `700`, `/root/.ssh/authorized_keys` -> `600`
  - `/supabase/supabase/docker/.env*` -> `600`
- [x] Dokploy runtime env persistence:
  - Queried Dokploy Postgres after seeding envs from the live app container.
  - `select "appName", length(env) ... from application` -> `1074`
  - `select "environmentId", length(env) ... from environment` -> `1074`

## Notes
- Because historical images were built with server secrets baked into the image environment, the affected credentials should be treated as candidates for rotation after the new deployment path is in place.
