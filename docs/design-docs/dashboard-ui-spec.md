# Dashboard UI Specification (Shared Primitives)

Last updated: 2026-03-01

## Shared Component Primitives

## 1. KPI Card
- Purpose: fast state read.
- Required content: label, value, short context line.
- Optional: trend delta.
- Behavior: non-clickable by default; add explicit CTA when actionable.

## 2. Action Queue Card
- Purpose: direct user to unresolved work.
- Required: item title, type chip, optional due date, open CTA.
- Behavior: each row must open destination page.

## 3. Alert Feed Item
- Purpose: communicate risk/severity.
- Required: severity chip, concise title, supporting message.
- Behavior: clicking item routes to corrective workflow.

## 4. Quick Ops Grid
- Purpose: role-optimized shortcuts.
- Required: 4-6 links to high-frequency workflows.
- Behavior: always visible above deep analytics.

## 5. Progress Card
- Purpose: show setup/goal progression.
- Required: numeric progress and contextual steps.
- Behavior: incomplete steps must link to exact completion page.

## Visual/System Rules
- Use token-based classes only (no hard-coded color drift).
- Keep border and radius consistent with existing app shell.
- Status chips:
  - info: blue
  - warning: amber
  - critical/error: rose
  - success: emerald

## Accessibility and Responsiveness
- Keyboard reachable for all CTA cards/rows.
- Action text must remain visible at tablet widths.
- Mobile layout stacks by priority:
  1. urgent actions
  2. quick ops
  3. analytics

## Loading/Error Handling
- Loading: skeletons for KPI, queue, and alerts.
- Error: show compact error panel plus route shortcuts to core pages.
