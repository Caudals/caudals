# Phase 30 - LANDING_MODE Public Surface Hardening Validation

- **Date:** 2026-03-28
- **Phase:** 30
- **Tasks:** `P30-T01` to `P30-T06`

## Automated Checks
- [x] `npm run i18n:check-parity`
- [x] `npm test -- --run lib/landing-mode.test.ts lib/blog/posts.test.ts lib/security/rate-limit.test.ts`
- [x] `npx eslint proxy.ts lib/landing-mode.ts lib/landing-mode.test.ts 'app/(app)/api/contact/route.ts' 'app/(home)/contact/page.tsx' 'app/(home)/page.tsx' components/contact/contact-form.tsx components/contact/contact-page-content.tsx components/ui/header.tsx components/marketing/footer.tsx components/landing/hero.tsx components/landing/social-proof.tsx components/landing/resource-strip.tsx components/landing/cta.tsx components/landing/partnerships.tsx components/landing/faq.tsx e2e/public-routes.spec.ts`
- [x] `npm run typecheck`
- [x] `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 LANDING_MODE=true NEXT_PUBLIC_LANDING_MODE=true npx playwright test e2e/public-routes.spec.ts --project=chromium`

## Browser Verification
- Tooling: Chrome DevTools MCP against `http://127.0.0.1:3001` with `LANDING_MODE=true NEXT_PUBLIC_LANDING_MODE=true npm run dev`.
- Verified allowed routes in isolated browser contexts:
  - `/`
  - `/contact`
  - `/blog`
- Verified blocked route:
  - `/pricing` rendered a plain `Not Found` response.

## UI Assertions
- `/` shows only `Contact` and `Blog` in the public header and footer while keeping the main landing experience on `/`.
- `/contact` uses the renamed contact flow and no longer exposes product/dashboard/legal navigation in the public header/footer.
- `/blog` and `/blog/[slug]` keep the same restricted public navigation instead of linking back into blocked product pages.
- The landing contact section, CTA copy, resource strip, and footer translations were updated so the Spanish marketing surface no longer leaks the old English strings introduced by the new contact-first flow.

## Deployment Assertions
- Confirmed `.github/workflows/deploy.yml` passes `LANDING_MODE=${{ secrets.LANDING_MODE || 'false' }}` into the Docker build.
- Confirmed `Dockerfile` maps the build arg into both `LANDING_MODE` and `NEXT_PUBLIC_LANDING_MODE` during build, and keeps `LANDING_MODE` in the runtime image.
- Documented the required GitHub Actions secret plus Dokploy runtime env setup in `docs/TOOLS.md`.
