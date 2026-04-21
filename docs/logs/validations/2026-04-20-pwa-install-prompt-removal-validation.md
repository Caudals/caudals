# 2026-04-20 - PWA Install Prompt Removal Validation

## Scope
Removed visible and native install prompts for the legacy Caudals Companion PWA without removing the hidden legacy PWA routes.

## Automated Checks
1. `npm run lint -- app/layout.tsx components/pwa/pwa-settings-client.tsx components/pwa/pwa-install-prompt-blocker.tsx`
   - Result: PASS

2. `npm run typecheck`
   - Result: PASS

3. `npm run i18n:check-parity`
   - Result: PASS
   - Missing keys: 0
   - Empty values: 0

4. JSON parse check for `translations-source.json`, `translations-es.json`, and `lib/i18n/es.json`
   - Result: PASS

5. Repository text scan for removed install-prompt copy
   - Result: PASS
   - Remaining match is only historical completed-plan documentation.

## Browser Verification
Chrome DevTools MCP against `http://localhost:3000/`:
- No rendered install prompt text: PASS
- No fixed bottom install banner node: PASS
- Synthetic cancelable `beforeinstallprompt` event was prevented: PASS
- Public landing page loaded: PASS

Screenshot evidence:
- `docs/logs/validations/assets/2026-04-20-pwa-install-prompt-removed-desktop.png`

Notes:
- Existing development HMR/i18n logs were present.
- Existing public-page `/api/user/role` 404 fetches remain unrelated to this change.
