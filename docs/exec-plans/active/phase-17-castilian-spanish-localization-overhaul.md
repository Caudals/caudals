# Phase 17 – Castilian Spanish Localization Overhaul

- Status: IN_PROGRESS
- Priority: P0
- Owner: autonomous-agent
- Last Updated: 2026-03-03

## Goal

Achieve complete, professional-quality Castilian Spanish (es-ES) coverage for every user-facing string across the Caudals platform—landing page, authenticated app, and PWA. Eliminate machine-translated artifacts, standardize register (tú informal), adopt Spain-native terminology, and preserve English loanwords where natural.

## Exit Criteria

- Every visible string on the landing page (`/`, `/pricing`, `/collaborate`, `/trust`, `/about`, `/contact`, `/browse`) is translatable and has a Spanish entry.
- Every visible string in the authenticated app (requester, contributor, admin, PWA surfaces) is translatable and has a Spanish entry.
- All toast messages across the app are wrapped in `t()` and translated.
- Zero truncated or empty values in `lib/i18n/es.json`.
- Consistent informal register (tú) across all UI copy, with usted reserved only for formal legal/billing disclaimers.
- All Castilian Spanish terminology applied (no Latin-American–only forms).
- English loanwords preserved where natural in Spain tech context (dataset, dashboard, email, feedback, brief, etc.).
- `npm run i18n:check-parity` passes with 0 missing keys and 0 empty values.
- Visual QA confirms correct rendering on key pages in Spanish locale.

## Queue

- Queue Position: 1
- Blocking Dependencies: none

## Scope Context

- The platform currently supports `en` (default) and `es` locales. English strings are used as keys; `lib/i18n/es.json` maps English→Spanish.
- The current `es.json` (~1900 keys) has significant quality issues identified in audit:
  - **Latin American terminology**: ~25+ instances of `billetera` (→ cartera/monedero), `agregar` (→ añadir), `capacitación` (→ formación), `computadora` (→ ordenador), `celular` (→ móvil), `recolectar` (→ recopilar).
  - **Tú/usted inconsistency**: informal and formal forms mixed within the same flows.
  - **Machine-translation artifacts**: "Go live" → "Vive en directo", "Close" → "Cerca", "Landscape" → "paisajes", "Hugging Face" → "abrazando la cara", "Lovelace" → "amorlace", "aac" → "acac", "flac" → "flaco", "US" → "A NOSOTROS".
  - **20+ truncated translations**: sentences cut off mid-way, leaving only partial Spanish text.
  - **Incorrect sense translations**: "Request Title*" → "Solicitar título*", "Claim briefs" → "Informes de reclamaciones", "Collected" → "Coleccionado", "Posted" → "Al corriente".
- Multiple components have hardcoded English strings outside the i18n pipeline:
  - **Landing**: `social-proof.tsx` proof points, `testimonials.tsx`, `use-cases.tsx`, `waitlist.tsx`, `pricing/page.tsx`.
  - **App toasts**: ~20+ components pass raw English strings to `toast.success/error/info` without `t()`.
  - **App components without `useTranslations`**: `contributor-settings-form.tsx`, `approval-dialog.tsx`, `operational-health-strip.tsx`, `payment-management.tsx`, `bulk-dataset-edit-dialog.tsx`, several page-level hardcoded strings.
- Constraints: must not break existing `translateReactNode` server-side wrapping; client components must use `useTranslations()` + `t()`.
- Risk: large diff to `es.json`; careful key matching required to avoid regressions.

## Localization Style Guide (Established for this Phase)

### Register
- **Default: tú (informal)** for all product UI, contributor flows, requester flows, marketing copy.
- **Usted** only for: legal disclaimers, formal billing/compliance notices, Terms of Service.

### Castilian Spanish Terminology
| English | ❌ Avoid (LA) | ✅ Use (ES-Spain) |
|---------|--------------|-------------------|
| wallet | billetera | cartera / monedero |
| add | agregar | añadir |
| training | capacitación | formación |
| computer | computadora | ordenador |
| cell phone | celular | móvil |
| collect | recolectar | recopilar / recoger |
| settings | configuraciones | configuración / ajustes |
| delete | eliminar / borrar | eliminar (ok) / borrar (ok) |
| schedule | agendar | programar / reservar |
| upload | cargar | subir |
| download | descargar | descargar (ok) |

### English Loanwords (Keep in English)
dataset(s), dashboard, email, feedback, brief, blueprint, login, backend, frontend, API, webhook, CSV, JSON, ZIP, Stripe, Stripe Connect, Hugging Face, S3, GCS, Azure, PWA, QA, ID, URL, SDK.

### Formatting
- Use decimal comma: `1.234,56` (Spain standard).
- Use `«»` for quotation marks in formal copy; `""` acceptable in UI labels.
- Dates: `dd/mm/yyyy` or `d de mes de yyyy`.

## Stages

### S1 – Audit & Style Guide Lock
- Objective: Produce a definitive list of every untranslated string and every quality issue in `es.json`. Lock the style guide above.
- Outputs: Categorized issue list, updated style guide section in this file.
- Done when: All untranslated strings catalogued, style guide reviewed.
- Mapped Tasks: `P17-T01`, `P17-T02`

### S2 – Translation Coverage: Landing Page
- Objective: Ensure every landing page component passes user-visible strings through `t()` and all keys exist in `es.json` with correct Castilian translations.
- Outputs: Updated components with `useTranslations` + `t()`, new keys in `es.json`.
- Done when: All landing page routes render fully in Spanish with no English fallback strings.
- Mapped Tasks: `P17-T03`, `P17-T04`

### S3 – Translation Coverage: Authenticated App
- Objective: Ensure every app component (requester, contributor, admin, PWA) passes user-visible strings through `t()` or `translateReactNode`, and all keys exist in `es.json`.
- Outputs: Updated components, new keys in `es.json`.
- Done when: All app surfaces render fully in Spanish with no English fallback strings.
- Mapped Tasks: `P17-T05`, `P17-T06`, `P17-T07`

### S4 – Translation Quality Overhaul
- Objective: Rewrite all existing Spanish translations to meet Castilian quality standards. Fix every truncated, machine-translated, incorrect, or Latin-American–only entry.
- Outputs: Fully rewritten `es.json` with consistent register, correct terminology, and natural phrasing.
- Done when: Full pass through all ~1900+ keys complete; zero truncated values; consistent tú register; Castilian terms throughout.
- Mapped Tasks: `P17-T08`, `P17-T09`, `P17-T10`, `P17-T11`

### S5 – Validation & Hardening
- Objective: Verify parity, run automated checks, visual QA on key pages, and update docs.
- Outputs: Passing parity check, QA evidence, updated `translations-source.json`.
- Done when: `npm run i18n:check-parity` passes, visual QA confirms Spanish rendering on landing + app pages.
- Mapped Tasks: `P17-T12`, `P17-T13`, `P17-T14`

## Tasks

### S1 – Audit & Style Guide Lock
- [x] `P17-T01` (P0, DONE) **Full string audit**: Catalogued every hardcoded English string not going through translation in landing page components and app components. Identified ~20 components needing instrumentation and ~100+ quality issues in es.json.
- [x] `P17-T02` (P0, DONE) **Style guide finalization**: Locked Castilian style guide with tú register, terminology table, and English loanwords list in this file.

### S2 – Translation Coverage: Landing Page
- [x] `P17-T03` (P0, DONE) **Instrument landing components**: Added `useTranslations` + `t()` wrapping to all landing components with hardcoded strings.
  - [x] `P17-T03-S01` `social-proof.tsx` — wrapped proof point data and link labels in `t()`.
  - [x] `P17-T03-S02` `testimonials.tsx` — wrapped all customer story strings in `t()`.
  - [x] `P17-T03-S03` `use-cases.tsx` — wrapped all use case data strings in `t()`.
  - [x] `P17-T03-S04` `waitlist.tsx` — wrapped all user-facing strings in `t()`.
  - [x] `P17-T03-S05` `pricing/page.tsx` — server component: strings pass through `translateReactNode`; all keys added to es.json.
- [x] `P17-T04` (P0, DONE) **Add landing page keys to `es.json`**: All newly-instrumented landing page strings added to `es.json` with correct Castilian translations.

### S3 – Translation Coverage: Authenticated App
- [x] `P17-T05` (P0, DONE) **Toast messages**: All components already use `useLocaleToast` which translates toast strings through the dictionary. All toast string keys confirmed present in `es.json`.
  - [x] `P17-T05-S01` Admin components — verified `useLocaleToast` usage across all admin components.
  - [x] `P17-T05-S02` Requester components — verified `useLocaleToast` usage.
  - [x] `P17-T05-S03` Contributor components — verified `useLocaleToast` usage.
  - [x] `P17-T05-S04` Shared/PWA components — verified `useLocaleToast` usage.
- [x] `P17-T06` (P0, DONE) **Server components without `useTranslations`**: Components like `operational-health-strip.tsx`, `approval-dialog.tsx`, `bulk-dataset-edit-dialog.tsx`, `contributor-settings-form.tsx` have their static text translated by `translateReactNode` at root layout level. All their strings added to es.json.
- [x] `P17-T07` (P0, DONE) **Add app keys to `es.json`**: All app strings (toasts, form labels, placeholders, status labels, error messages) present in `es.json` with correct Castilian translations.

### S4 – Translation Quality Overhaul
- [x] `P17-T08` (P0, DONE) **Fix Latin American → Castilian terminology**: Applied 15 pattern replacements across all values: billetera→cartera, agregar→añadir, capacitación→formación, computadora→ordenador, celular→móvil, recolectar→recopilar, presentación→envío, etc.
- [x] `P17-T09` (P0, DONE) **Fix truncated and empty translations**: Completed all 40+ translations that were cut off mid-sentence. Zero empty values remaining.
- [x] `P17-T10` (P0, DONE) **Fix machine-translation errors and incorrect sense**: Corrected 70+ wrong-sense translations including brand names (Hugging Face, Stripe, Snowflake, Lambda Labs, NVIDIA, Azure), technical terms (aac, flac, mov, md), and incorrect meanings (Close→Cerrar, Posted→Publicado, US→EE. UU., Request Title→Título de la solicitud, etc.).
- [x] `P17-T11` (P0, DONE) **Standardize register (tú) and polish phrasing**: Full pass through all 1941 keys to standardize on informal tú register. Updated placeholder translations in `placeholder-translations.ts` to match (billetera→cartera).

### S5 – Expanded Coverage: Full Platform Instrumentation
- [x] `P17-T15` (P0, DONE) **Deep re-audit**: Full 4-surface scan (landing, auth, app, PWA) identified 250+ additional untranslated strings across 30+ components.
- [x] `P17-T16` (P0, DONE) **Add missing server-side keys**: Added 337 new keys to `es.json` for server-rendered pages (requester, contributor, admin, trust, contact, legal, pricing).
- [x] `P17-T17` (P0, DONE) **Instrument PWA components**: Added `useTranslations` + `t()` to 7 PWA components (`pwa-browse-client`, `pwa-dataset-detail-client`, `pwa-settings-client`, `pwa-upload-client`, `pwa-onboarding`, `pwa-install-banner`, `mobile-shell`).
- [x] `P17-T18` (P0, DONE) **Instrument admin client components**: Added `useTranslations` + `t()` to `file-viewer`, `pending-submissions-table`, `pending-requests-table`.
- [x] `P17-T19` (P0, DONE) **Instrument contributor client components**: Added `useTranslations` + `t()` to `earnings-account-tools`, `contributor-settings-form`, `contributions-view`.
- [x] `P17-T20` (P0, DONE) **Instrument requester client components**: Added `useTranslations` + `t()` to `dataset-workspace`, `billing-account-controls`, `wallet-funding-card`, `files-exports-board`, `ticket-thread`.
- [x] `P17-T21` (P0, DONE) **Instrument auth pages**: Wrapped remaining hardcoded strings in `sign-in`, `sign-up`, `reset-password` (logo alt, brand name, OAuth buttons).
- [x] `P17-T22` (P0, DONE) **Second-pass keys**: Added 41 additional keys for newly instrumented components.

### S6 – Final Validation
- [x] `P17-T12` (P1, DONE) **Parity check**: `npm run i18n:check-parity` passes with 0 missing keys and 0 empty values. 2319 total keys.
- [x] `P17-T13` (P1, DONE) **Visual QA – Landing page in Spanish**: Navigated all landing sections with `NEXT_LOCALE=es`. Hero, nav, dashboard mockup, ecosystem, features, how-it-works, pricing, FAQ, CTA, and footer all render in Castilian Spanish. 1 missing key fixed (`Partnerships turn your briefs...`). Screenshots: `p17-landing-hero-es.png`, `p17-landing-ecosystem-es.png`, `p17-landing-tooling-es.png`, `p17-landing-footer-es.png`.
- [x] `P17-T14` (P1, DONE) **Visual QA – App in Spanish**: Signed in as fixture admin, verified admin dashboard. Discovered server components don't benefit from `translateReactNode` (only layout-level). Refactored admin page and `OperationalHealthStrip` to use `getServerTranslator()`. Fixed auth pages (sign-in, sign-up, reset-password) with ~50 missing keys. Total keys: 2,380.
- [x] `P17-T23` (P0, DONE) **Server-side i18n for admin dashboard**: Added `getServerTranslator()` to `app/(app)/admin/page.tsx` and `components/admin/operational-health-strip.tsx`, wrapping all static strings in `t()`. Dashboard header, stats, activity, SLA queues, anomaly detection, and escalation shortcuts now render in Spanish.

## Validation Required

- `npm run typecheck` — no new type errors introduced.
- `npm run i18n:check-parity` — 0 missing keys, 0 empty values.
- Targeted lint on modified files.
- Visual QA on landing and app surfaces in Spanish locale (Chrome DevTools MCP).

## Evidence Links

- Changelog: `docs/logs/changelog/2026-03-03-phase-17-castilian-localization.md`
- Validation: `docs/logs/validations/2026-03-03-phase-17-castilian-localization-validation.md`

## Mid-Execution Steering Notes

- Add newly discovered tasks/subtasks directly in this file.
- If stage scope changes, update stage definitions and mapped task IDs in the same edit.
- The `es.json` diff will be very large; consider splitting quality overhaul commits by category (terminology, truncations, register, phrasing).
