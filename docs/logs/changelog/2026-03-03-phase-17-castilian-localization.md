# Phase 17 – Castilian Spanish Localization Overhaul

**Date**: 2026-03-03

## Summary

Complete overhaul of the Spanish (es) localization across the Caudals platform — landing page, authenticated app, and PWA. Eliminated machine-translated artifacts, standardized on Castilian Spanish (es-ES) with tú register, and ensured full translation coverage.

## Changes

### Component Instrumentation (S2)
- `components/landing/social-proof.tsx`: Wrapped proof point data (title, value, detail) and link labels ("Trust center", "Security baseline", "Launch requester onboarding") in `t()`.
- `components/landing/testimonials.tsx`: Added `useTranslations`, wrapped all customer story quotes and role titles in `t()`.
- `components/landing/use-cases.tsx`: Added `useTranslations`, wrapped all use case categories, titles, descriptions, and tags in `t()`.
- `components/landing/waitlist.tsx`: Added `useTranslations`, wrapped badge text, headings, placeholder, button label, and result messages in `t()`.

### Translation Quality Overhaul (S4)
- **314 specific key corrections** applied to `lib/i18n/es.json`:
  - Fixed ~70+ wrong-sense translations (brand names, technical terms, incorrect meanings).
  - Completed ~40+ truncated translations that were cut off mid-sentence.
  - Standardized register to informal tú throughout.
  - Added all new keys for newly-instrumented landing page components.
  - Added all keys for server-rendered pricing page and app components.
- **15 pattern replacements** applied across all values:
  - billetera → cartera, agregar → añadir, capacitación → formación, computadora → ordenador, celular → móvil, recolectar → recopilar, presentación → envío.
- **`lib/i18n/placeholder-translations.ts`**: Updated billetera→cartera and improved phrasing.

### Key Fixes Highlights
| Before | After |
|--------|-------|
| "abrazando la cara" | "Hugging Face" |
| "amorlace" | "Lovelace" |
| "Cerca" (for Close) | "Cerrar" |
| "A NOSOTROS" (for US) | "EE. UU." |
| "acac" (for aac) | "aac" |
| "flaco" (for flac) | "flac" |
| "Raya" (for Stripe) | "Stripe" |
| "Copo de nieve" (for Snowflake) | "Snowflake" |
| "Solicitar título*" | "Título de la solicitud*" |
| "billetera" (25+ instances) | "cartera" |
| "capacitación" (7+ instances) | "formación" |
| "computadora" (3+ instances) | "ordenador" |

### Expanded Coverage (S5 – Full Platform Instrumentation)
Second deep scan identified 250+ additional untranslated strings across 30+ components.

**Keys added**: 337 server-side keys + 41 component keys = 378 new translations. Total: 2319 keys.

**PWA components instrumented** (7 files):
- `pwa-browse-client.tsx`, `pwa-dataset-detail-client.tsx`, `pwa-settings-client.tsx`, `pwa-upload-client.tsx` — all user-facing strings wrapped in `t()`.
- `pwa-onboarding.tsx`, `pwa-install-banner.tsx`, `mobile-shell.tsx` — all strings wrapped.

**Admin components** (3 files):
- `file-viewer.tsx`, `pending-submissions-table.tsx`, `pending-requests-table.tsx` — added `useTranslations` + `t()`.

**Contributor components** (3 files):
- `earnings-account-tools.tsx`, `contributor-settings-form.tsx`, `contributions-view.tsx` — added `useTranslations` + `t()`.

**Requester components** (5 files):
- `dataset-workspace.tsx`, `billing-account-controls.tsx`, `wallet-funding-card.tsx`, `files-exports-board.tsx`, `ticket-thread.tsx` — added `useTranslations` + `t()`.

**Auth pages** (3 files):
- `sign-in/page.tsx`, `sign-up/page.tsx`, `reset-password/page.tsx` — wrapped remaining hardcoded strings (logo alt, brand name, OAuth buttons).

**Server-rendered pages covered** (keys in es.json for `translateReactNode`):
- All requester pages: dashboard, analytics, datasets, files, billing, support, settings, onboarding.
- All contributor pages: contributions, earnings, settings.
- All admin pages: dashboard, users, requests, submissions, datasets, payments, analytics, activity, featured, support, settings.
- Trust, Contact, Pricing, About, Legal pages.
- PWA offline page.

### S6 – Visual QA & Server-Side i18n Fix

**Critical discovery**: `translateReactNode` in `app/layout.tsx` only translates layout-level content—not page-level server component output. Server pages need explicit `getServerTranslator()` calls.

**Admin dashboard server-side i18n** (2 files):
- `app/(app)/admin/page.tsx` — imported `getServerTranslator`, wrapped 50+ static strings in `t()`.
- `components/admin/operational-health-strip.tsx` — converted to async, added `getServerTranslator`, translated labels, summaries, and status badges.

**Auth pages fixes** (3 files):
- `sign-in`: added "Forgot your password?", "Coordinate datasets..." subtitle, "Role-based workspaces for requester, contributor, and admin".
- `sign-up`: added "Create your Caudals workspace in minutes", "Pick your role now...", feature bullet translations.
- `reset-password`: added 15+ keys for all form states (request, update, verification).

**Landing page fix**: 1 missing key ("Partnerships turn your briefs into sponsored placements...").

**Keys added in this pass**: 61 new keys. **Total: 2,380 keys**.

## Validation
- `npx tsc --noEmit` — passes (0 errors).
- `npm run i18n:check-parity` — 0 missing keys, 0 empty values, 2380 total keys.
- No linter errors on modified files.
- Visual QA screenshots saved to `docs/logs/validations/p17-*.png`.
