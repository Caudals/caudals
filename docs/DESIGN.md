# Caudals Design System

## Purpose
Single source of truth for visual/system behavior across the current landing/contact/blog surface and future internal admin/B2B marketplace surfaces.

## Agent Instructions
When building or refactoring components, agents must adhere to this design system.
1. Always match the live landing page before introducing new aesthetics.
2. Use a white editorial base with black type, gray structure, and teal accents.
3. Never use heavy generic shadows. The only large shadow pattern currently accepted is the soft browser-preview shadow in the hero mockup.
4. Use subtle borders: `border-gray-100`, `border-gray-200`, or translucent variants.
5. Typography hierarchy is paramount: large, tracking-tight display type; calm body text; tiny bold uppercase labels where the landing uses them.
6. Buttons are black or outline by default. Teal is an accent, not the default button fill.
7. Keep the visual language focused on B2B AI data operations, company data intake, and dataset delivery.

## Scope
- In scope: landing, contact, blog, internal admin, future buyer/supplier marketplace UI
- In scope: responsive behavior (mobile/tablet/desktop)
- Out of scope: hidden authenticated surfaces unless explicitly being removed or rebuilt for the B2B model
- Out of scope: dark mode rollout (this design system is strictly Light Mode first)
- Out of scope: schema/domain contract changes

## Experience Principles
1. Editorial calm: high-value enterprise data should feel precise, quiet, and serious.
2. Content breathes: public sections use generous vertical rhythm (`py-24`, `sm:py-32`) and `max-w-5xl`.
3. Trust is operational: rights, provenance, PII, QA, freshness, and license state must be visible in admin/marketplace UI.
4. Dense admin screens must remain readable under time pressure.
5. Motion should feel deliberate and light; use Framer Motion reveal patterns already present in landing sections.

## Foundation Tokens (Tailwind mapping)
Use tokenized values only (no ad-hoc drift).

```css
:root {
  --ds-canvas: #f9fafb; /* gray-50 */
  --ds-sidebar-bg: #f9fafb;
  --ds-surface: #ffffff; /* pure white */
  --ds-border-soft: #f3f4f6; /* gray-100 */
  --ds-border-strong: #e5e7eb; /* gray-200 */

  --ds-text-primary: #111827; /* gray-900 */
  --ds-text-secondary: #6b7280; /* gray-500 */
  --ds-text-tertiary: #9ca3af; /* gray-400 */

  --ds-accent: #059669; /* emerald-600 */
  --ds-accent-soft: #ecfdf5; /* emerald-50 */
  --ds-accent-text: #047857; /* emerald-700 */

  --ds-danger: #dc2626;
  --ds-warning: #d97706;
  --ds-info: #2563eb;

  --ds-cta-bg: #111827; /* black/gray-900 */
  --ds-cta-text: #ffffff;
}
```

Typography baseline:
- Sans stack follows `app/globals.css`: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `SF Pro Display`, `Segoe UI`, `Roboto`, `Helvetica`, `Arial`, sans-serif.
- Serif accent stack follows `app/globals.css`: `"New York"`, `"Iowa"`, `"Georgia"`, serif.
- Display headings: `text-4xl sm:text-5xl` for sections; `text-5xl sm:text-7xl lg:text-8xl` for the landing hero.
- Hero highlight: serif italic teal (`font-serif italic text-teal-700/90`).
- Labels: `text-[13px] font-bold text-teal-600` or tiny uppercase labels where used in mockups.

Geometry baseline:
- Radius scale: buttons and form controls use `rounded-md`; content panels use `rounded-xl`; pills use `rounded-full`.
- Motion: `150ms-200ms`, ease-out transitions for hover states.

## Layout System
- Public canvas: white (`bg-white`) with alternating very light gray bands (`bg-gray-50/50`).
- Section container: `mx-auto max-w-5xl px-6 sm:px-8 lg:px-12`.
- Section rhythm: `py-24 sm:py-32`.
- Header: sticky, transparent at top, translucent white with backdrop blur and subtle bottom border on scroll.
- Hero: Spline ribbon background, centered copy, black/teal badge, huge display title, waitlist form, browser-style marketplace console preview.
- Contact form: `bg-gray-50/50`, subtle border, `rounded-md`, minimalist bottom-border fields.
- Admin canvas: light gray background with white panels, subtle borders, compact trust/status chips.
- Popovers/dialogs: solid white surfaces with soft border and restrained shadow.

## Core Component Contracts
- Buttons: primary black (`bg-black text-white hover:bg-black/90`), secondary outline (`border-gray-200 text-black hover:bg-gray-50`), ghost for navigation.
- Inputs/selects: public contact forms use transparent backgrounds and bottom borders; compact forms may use white/gray backgrounds with soft borders.
- Badges/chips: subtle teal or gray backgrounds; use dots for live/processing states.
- Cards/panels: pure white, `border border-gray-100/200`, `shadow-none` or `shadow-sm`, generous padding.
- Tables: very clean, minimal borders, horizontal lines only.

## Landing and Marketing Page Contract
- Overall aesthetic: editorial, high-contrast, sparse, serious, with a refined AI-data feel.
- Palette: white, black, gray-50/100/200/400/500/600, teal-50/500/600/700/800/900.
- Layout: expansive white space, alternating white and gray-50/50 bands, centered max-width content, minimal card nesting.
- Copy tone: direct B2B data operations language. Avoid explaining UI mechanics or using generic AI hype.
- Forms: simple, slightly rounded shell or bottom-border inputs, black focus, no noisy decoration.
- Shadows: none or subtle, except hero console preview.

## Acceptance Checklist
A UI change is ready when:
1. token contract is preserved: clean, light, minimal borders,
2. public landing design remains consistent with the current live page,
3. loading, empty, error, and success states are explicit but visually subtle,
4. responsive behavior works on mobile, tablet, and desktop,
5. no heavy shadows or harsh borders are introduced.
