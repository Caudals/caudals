# 2026-03-28 - Phase 30 LANDING_MODE Public Surface Hardening

## Summary
Replaced the prototype LANDING_MODE redirect experiment with a production-grade public-surface allowlist so the live site can expose only the primary landing page, `/contact`, and the blog while the rest of the application remains hidden behind 404s.

## Delivered
- Added shared LANDING_MODE helpers and proxy enforcement so only `/`, `/contact`, `/blog`, `/blog/*`, required assets, and explicitly allowed public APIs remain reachable when `LANDING_MODE=true`.
- Removed the duplicate `/landing-simple` route and deleted the old public partnerships intake (`/collaborate`, collaboration API route, and collaboration email/form components).
- Consolidated the public intake into `/contact` with a dedicated contact API route, contact email template, and contact-oriented landing copy.
- Updated the landing CTAs, header, footer, contact page, blog list, and blog post pages so public navigation never points at blocked product routes while LANDING_MODE is active.
- Documented how the existing GitHub Actions -> Docker Hub -> Dokploy deployment flow must set `LANDING_MODE` at both build time and runtime.

## Activation Notes
- GitHub Actions build-time flag: repository secret `LANDING_MODE=true` so `.github/workflows/deploy.yml` passes the build arg into `Dockerfile`, which bakes `NEXT_PUBLIC_LANDING_MODE` into the public bundle.
- Dokploy runtime flag: set `LANDING_MODE=true` on the deployed service as well so the server-side proxy applies the same allowlist at runtime.
- A fresh image build and redeploy are required after changing the flag.
