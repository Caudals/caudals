# 2026-04-20 - PWA Install Prompt Removal

## Summary
- Removed the global mobile install banner for the legacy Caudals Companion PWA.
- Removed the PWA settings install instructions card and dialog.
- Added a no-UI global blocker for `beforeinstallprompt` so eligible browsers cannot show a native install popup.
- Removed stale install-prompt copy from the translation source and Spanish dictionaries.

## Files
- `app/layout.tsx`
- `components/pwa/pwa-install-prompt-blocker.tsx`
- `components/pwa/pwa-install-banner.tsx`
- `components/pwa/pwa-settings-client.tsx`
- `translations-source.json`
- `translations-es.json`
- `lib/i18n/es.json`

## Validation
- See `docs/logs/validations/2026-04-20-pwa-install-prompt-removal-validation.md`.
