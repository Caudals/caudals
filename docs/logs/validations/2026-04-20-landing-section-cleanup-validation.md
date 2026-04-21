# 2026-04-20 - Landing Section Cleanup Validation

## Scope
Landing page changes for the five browser diff comments:
- remove the proof-point row in industry coverage,
- remove the CTA/link strip in industry coverage,
- remove the platform-layers process section,
- move the two-sided workflow section above capabilities,
- improve the contact section layout while preserving the design system.

## Automated Checks
1. `npm run lint -- components/landing/social-proof.tsx components/landing/home-page-client.tsx components/landing/partnerships.tsx`
   - Result: PASS

2. `npm run typecheck`
   - Result: PASS

3. `npm run i18n:check-parity`
   - Result: PASS
   - Missing keys: 0
   - Empty values: 0

## Browser Verification
Chrome DevTools MCP against `http://localhost:3000/`:
- Removed proof-point copy: PASS
- Removed link strip copy: PASS
- Removed platform-layers copy: PASS
- `#how-it-works` appears before `#features`: PASS
- Contact section renders with revised layout and copy: PASS

DOM verification output:
```json
{
  "removedTrustCards": true,
  "removedCtaStrip": true,
  "removedPlatformLayers": true,
  "howItWorksBeforeFeatures": true
}
```

Console/network notes:
- Existing development logs from HMR and i18n were present.
- Two pre-existing public-page `GET /api/user/role` 404 fetches remain; they are unrelated to this landing section edit.
- One browser issue for a missing autocomplete attribute was present.

## Screenshot Evidence
- `docs/logs/validations/assets/2026-04-20-landing-how-it-works-reordered-desktop.png`
- `docs/logs/validations/assets/2026-04-20-landing-contact-layout-desktop.png`
- `docs/logs/validations/assets/2026-04-20-landing-contact-layout-tablet.png`
- `docs/logs/validations/assets/2026-04-20-landing-contact-layout-mobile.png`
- `docs/logs/validations/assets/2026-04-20-landing-fullpage-tablet.png`
- `docs/logs/validations/assets/2026-04-20-landing-fullpage-mobile.png`
