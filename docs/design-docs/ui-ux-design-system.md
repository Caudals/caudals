# Caudals UI/UX Design System (Mintlify-Inspired)

## Purpose
Single source of truth for visual/system behavior across landing, auth, requester, contributor, and admin web surfaces. This document provides strict instructions for LLMs and AI agents to follow autonomously when generating or refactoring UI components.

## AI Agent Instructions (CRITICAL)
When building or refactoring components, AI agents MUST adhere to this design system.
1. **Always use the design system.** The design shuold replicate the reference images, components and screenshots in `docs/design-docs/design-images/`.
2. **Never use heavy shadows.** Default to `shadow-none` or `shadow-sm` for cards, and `shadow-md` only for floating popovers/dialogs.
3. **Use subtle borders.** Use `border border-gray-200` (or `border-border` if using Shadcn) for structural elements. Do not use high-contrast borders unless it's a specific form state.
4. **Typography hierarchy is paramount.** Use clean sans-serif (Inter, Geist, or system-ui). Primary text is `text-gray-900`, secondary is `text-gray-500`. Headers must be crisp, with tighter letter spacing for large display text.
5. **Active States:** Sidebar and navigation active states use a soft green pill background (`bg-emerald-50` or `bg-green-50`) with green text (`text-emerald-700`).
6. **Main Canvas vs Sidebar:** The main content area is pure white (`bg-white`), while sidebars or backgrounds behind cards are a very light gray (`bg-gray-50/50` or `#f9fafb`).
7. **No zebra-striping in tables.** Tables must be extremely clean with only horizontal dividers (`border-b border-gray-100`). Header rows should use `text-xs font-medium text-gray-500 uppercase tracking-wider`.
8. **Buttons:** Primary buttons are solid (either black `bg-gray-900 text-white` or brand green `bg-emerald-600 text-white`). Secondary buttons are outlined or ghost.

## Scope
- In scope: web app + marketing + auth surfaces
- In scope: responsive behavior (mobile/tablet/desktop)
- Out of scope: major PWA redesign
- Out of scope: dark mode rollout (this design system is strictly Light Mode first)
- Out of scope: schema/domain contract changes

## Experience Principles
1. Operational clarity over decorative complexity.
2. Content breathes: use generous padding (e.g., `p-6` or `p-8` for cards/sections).
3. Dense operational screens must remain readable under time pressure.
4. Trust signals (review state, payout state, severity) stay visible using minimal chips (e.g., green dot + text, no heavy solid backgrounds for status chips unless critical).

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
- Sans stack: `"Geist", "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif`
- Use a consistent scale for display/headings/body/labels/captions.

Geometry baseline:
- Radius scale: `md`, `lg`, `xl`. Cards and dialogs should use `rounded-xl` or `rounded-2xl` for a modern, soft feel. Buttons use `rounded-md` or `rounded-lg`.
- Motion: `150ms-200ms`, ease-out transitions for hover states.

## Layout System
- Canvas: light gray background (`bg-gray-50`).
- Sidebar: fixed on desktop, clean with no right border or very faint border, soft green active items.
- Topbar: integrates breadcrumbs and a prominent, wide Command-K search bar (gray background, minimal border).
- Main panel: pure white surface with soft border, or content directly on the canvas with white cards.
- Popovers/dialogs: solid white surfaces with soft border and `shadow-lg`.

## Core Component Contracts
- Buttons: primary (black or green), secondary (outline), ghost (transparent with gray hover). Full state set required.
- Inputs/selects: `bg-white` or `bg-gray-50`, soft border `border-gray-200`, focus ring `ring-emerald-500`.
- Badges/chips: subtle backgrounds (e.g., `bg-emerald-50 text-emerald-700`) or just a dot indicator with text. No heavy, dark badge backgrounds.
- Cards: pure white, `border border-gray-200`, `shadow-none` or `shadow-sm`, generous padding (`p-6`).
- Tables: very clean, minimal borders, horizontal lines only.

## Landing and Marketing Page Contract
- **Overall Aesthetic**: Brutally minimal, editorial, high-contrast black and white.
- **Typography**: Large, clean serif or sans-serif headings with tight tracking (`tracking-tight`). Generous line height on body copy.
- **Layout**: Expansive white space (`bg-white`), strong horizontal and vertical dividers (`border-gray-200`), minimal use of containers/cards. Use centered, focused layouts where appropriate.
- **Form Elements**: Clean and minimal. Slightly rounded borders (`rounded-md`), simple bottom borders (`border-b border-gray-300`), focus states use solid black borders. Backgrounds are transparent or very light gray (`bg-gray-50/50`).
- **Buttons**: Blocky but with slight rounding (`rounded-md`), solid colors (`bg-black text-white hover:bg-gray-900`), standard sentence or title case.
- **Shadows**: None. Completely flat interface.

## Acceptance Checklist
A UI change is accepted only when:
1. token contract is preserved (clean, light, minimal borders),
2. shell/sidebar contract is preserved,
3. loading/empty/error/success states are explicit but visually subtle,
4. responsive checks pass on mobile/tablet/desktop,
5. no heavy shadows or harsh borders are introduced,
6. validation evidence is logged in `docs/logs/validations/`.
