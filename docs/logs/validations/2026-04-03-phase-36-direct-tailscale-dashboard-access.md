# 2026-04-03 - Phase 36 Direct Tailscale Dashboard Access Validation

## Scope
- Phase: `P36`
- Tasks validated: `P36-T01`, `P36-T02`, `P36-T03`, `P36-T04`

## Host Validation
- [x] Nginx dashboard proxy configuration active on the VPS
  - `systemctl is-active nginx` -> `active`
  - listeners:
    - `0.0.0.0:7443`
    - `0.0.0.0:7444`
- [x] UFW restricts direct dashboard ports to the tailnet interface only
  - `7443/tcp on tailscale0` -> `ALLOW IN`
  - `7444/tcp on tailscale0` -> `ALLOW IN`
- [x] Local backend proxy checks on the VPS
  - `http://127.0.0.1:7443/` -> `HTTP/1.1 200 OK` for Dokploy
  - `http://127.0.0.1:7444/` -> `HTTP/1.1 200 OK` for Umami

## Tailnet Reachability Validation
- [x] Dokploy reachable directly over Tailscale
  - `http://ubuntu-caudals:7443/` -> `HTTP/1.1 200 OK`
  - `http://100.92.160.68:7443/` -> `HTTP/1.1 200 OK`
- [x] Umami reachable directly over Tailscale
  - `http://ubuntu-caudals:7444/` -> `HTTP/1.1 200 OK`
  - `http://100.92.160.68:7444/` -> `HTTP/1.1 200 OK`

## Public Inaccessibility Validation
- [x] Public dashboard ports remain closed
  - `161.35.200.8:7443` -> closed
  - `161.35.200.8:7444` -> closed
- [x] Public HTTPS dashboards remain removed
  - `https://dokploy.caudals.com/` -> `HTTP/2 404`
  - `https://analytics.caudals.com/` -> `HTTP/2 404`
  - `https://analytics.caudals.com/script.js` -> `HTTP/2 200`

## Repo Validation
- [x] Obsolete helper removed
  - `scripts/tailscale-dashboard-tunnel.sh` deleted

## Notes
- Backup of the new host-level direct access configuration was stored on the VPS at `/root/security-backups/20260403-210004-phase36-direct-access`.
