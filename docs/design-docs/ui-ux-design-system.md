# Caudals UI/UX Design System

## Purpose
Single source of truth for visual/system behavior across landing, auth, requester, contributor, and admin web surfaces.

## Scope
- In scope: web app + marketing + auth surfaces
- In scope: responsive behavior (mobile/tablet/desktop)
- Out of scope: major PWA redesign
- Out of scope: dark mode rollout
- Out of scope: schema/domain contract changes

## Experience Principles
1. Operational clarity over decorative complexity.
2. Critical actions must be obvious and reversible when possible.
3. Dense operational screens must remain readable under time pressure.
4. Role workflows must not feel interchangeable.
5. Trust signals (review state, payout state, severity) stay visible.

## Hard Product Contracts
- Canonical requester IA: `/requester/*`
- `/dashboard` is a role entrypoint, not canonical requester workspace IA.
- Shared shell structure across roles:
  - top identity zone
  - middle grouped navigation
  - bottom utilities/settings
- Light mode only in this delivery track.

## Foundation Tokens
Use tokenized values only (no ad-hoc drift).

```css
:root {
  --ds-canvas: #f5f5f5;
  --ds-sidebar-bg: #f4f4f4;
  --ds-surface: #ffffff;
  --ds-border-soft: #ebebeb;
  --ds-border-strong: #e3e3e3;

  --ds-text-primary: #121212;
  --ds-text-secondary: #6d6d6d;
  --ds-text-tertiary: #9a9a9a;

  --ds-accent: #14a44c;
  --ds-accent-soft: #eaf7ee;
  --ds-accent-text: #11823c;

  --ds-danger: #d64545;
  --ds-warning: #c9771a;
  --ds-info: #2f7fd3;

  --ds-cta-bg: #121212;
  --ds-cta-text: #ffffff;
}
```

Typography baseline:
- Sans stack: `"Geist", "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif`
- Use a consistent scale for display/headings/body/labels/captions.

Geometry baseline:
- Radius scale: `6, 8, 10, 12, 16` (+ shell radius)
- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`
- Motion: `120ms-220ms`, ease-out/cubic-bezier transitions only

## Layout System
- Canvas: neutral light background
- Sidebar: fixed on desktop, collapsible on tablet, drawer on mobile
- Main panel: white surface with soft border and consistent padding rhythm
- Popovers/dialogs: solid white surfaces with soft border and controlled elevation

## Dashboard Module Contracts
1. KPI Card
- label + value + short context
- optional trend delta

2. Action Queue Card
- title + status/severity + direct action destination

3. Alert Feed Item
- severity chip + concise message + corrective route

4. Quick Ops Grid
- 4-6 high-frequency actions above deep analytics

5. Progress Card
- visible completion state + links to unfinished setup tasks

## Core Component Contracts
- Buttons: primary/secondary/ghost/destructive variants with full state set
- Inputs/selects: consistent height, focus ring, placeholder contrast
- Badges/chips: success/warning/error/info/neutral semantics
- Cards/tables: border-led depth, compact row rhythm, status pills
- Forms: labels above controls, consistent spacing, helper/error text handling
- Menus/dialogs/popovers: keyboard navigation + visible focus states mandatory
- Charts: accent-first primary series with subdued supporting series

## Accessibility and Responsiveness
- All primary actions keyboard reachable.
- Focus-visible state required for interactive controls.
- Text contrast must remain readable on all status surfaces.
- Mobile ordering priority:
  1. urgent actions
  2. quick ops
  3. analytics

## Acceptance Checklist
A UI change is accepted only when:
1. token contract is preserved,
2. shell/sidebar contract is preserved,
3. role route ownership is preserved,
4. loading/empty/error/success states are explicit,
5. responsive checks pass on mobile/tablet/desktop,
6. validation evidence is logged in `docs/logs/validations/`.
