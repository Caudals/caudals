# Caudals Design System v2

## Purpose + Scope

This document is the single source of truth for AI agents that refactor Caudals UI and UX.

### Goal

Deliver a polished, production-ready interface for:

1. Marketing landing surfaces
2. Auth surfaces
3. Requester app surfaces
4. Contributor app surfaces
5. Admin app surfaces

You should use frontend-design agents skill.

### Fidelity target

Design output must be near-identical to visual language shown in `./mobbin-screen-*.webp`:

1. Light gray app canvas
2. White primary content surfaces
3. Subtle neutral borders
4. Rounded shells and controls
5. Green accent highlights
6. Dark primary CTA buttons

### Scope in this phase

1. Web app and landing only
2. PWA is explicitly out of scope
3. Light mode only

### Non-goals in this phase

1. No dark mode token system
2. No backend schema changes
3. No new data model contracts

---

## Hard Product Contracts

### Navigation contract

Canonical requester workspace paths are `/requester/*`.

Legacy requester workspace paths under `/dashboard/*` are deprecated immediately in target-state design contract. No compatibility alias is part of final IA.

### Shell contract

1. Fixed left sidebar on desktop
2. Light gray canvas background
3. White main content panel with soft border and rounded outer corners
4. Consistent spacing rhythm across pages

### Sidebar contract

1. Top zone: profile or workspace identity
2. Middle zone: grouped primary navigation
3. Bottom zone: settings and utility links
4. This structure is mandatory across requester, contributor, and admin variants

### Theme contract

Light mode only. Any dark-theme token additions are out of scope.

---

## Design Reference Mapping

All screenshots are in 1920x1320 and should be treated as composition references.

| Reference file | Pattern family | Primary usage in Caudals |
| --- | --- | --- |
| `./mobbin-screen-1772365016117.webp` | Marketing hero + product preview shell | Main landing hero direction |
| `./mobbin-screen-1772365026230.webp` | App overview dashboard shell | Requester overview shell baseline |
| `./mobbin-screen-1772365036095.webp` | Expanded activity row + status logs | Requester tables with expandable details |
| `./mobbin-screen-1772365041045.webp` | Left rail + dashboard list variant | Contributor dashboard list pattern |
| `./mobbin-screen-1772365056390.webp` | Settings-like table with cards | Requester settings and support list layouts |
| `./mobbin-screen-1772365073728.webp` | Editor workspace split nav + content | Dense workspace pages with file/data navigation |
| `./mobbin-screen-1772365088434.webp` | Documentation page shell | Help/docs style content pages |
| `./mobbin-screen-1772365094652.webp` | Search/command overlay | Command palette + query result overlays |
| `./mobbin-screen-1772365100818.webp` | Analytics table + controls | Admin and requester analytics data tables |
| `./mobbin-screen-1772365106027.webp` | Line chart analytics | KPI and trend visualization style |
| `./mobbin-screen-1772365111686.webp` | Feature toggles list | Settings toggles and integrations sections |
| `./mobbin-screen-1772365126469.webp` | Two-column settings form cards | Billing/setup configuration forms |
| `./mobbin-screen-1772365129201.webp` | Auth split layout | Sign-in/sign-up layout model |
| `./mobbin-screen-1772365132656.webp` | Pricing plans cards | Billing plans and upgrade cards |
| `./mobbin-screen-1772365136766.webp` | Feature comparison matrix | Plan comparison tables |
| `./mobbin-screen-1772365141082.webp` | API key settings page | Requester API key management pages |
| `./mobbin-screen-1772365147381.webp` | Team members table + toast | Members/admin users list screens |
| `./mobbin-screen-1772365174944.webp` | Dashboard variant with top actions | Requester/contributor overview with primary actions |
| `./mobbin-screen-1772367953526.webp` | Marketing hero variant | Secondary landing state |
| `./mobbin-screen-1772368168095.webp` | API playground modal-like workspace | Advanced admin tooling or debug screens |
| `./mobbin-screen-1772368187321.webp` | Git settings panel variant | Secondary settings panel structure |

---

## Foundations

### 1. Color tokens

Use this token set as baseline.

```css
:root {
  --ds-canvas: #f5f5f5;
  --ds-sidebar-bg: #f4f4f4;
  --ds-surface: #ffffff;
  --ds-surface-muted: #fafafa;
  --ds-border-soft: #ebebeb;
  --ds-border-strong: #e3e3e3;

  --ds-text-primary: #121212;
  --ds-text-secondary: #6d6d6d;
  --ds-text-tertiary: #9a9a9a;
  --ds-text-inverse: #ffffff;

  --ds-accent: #14a44c;
  --ds-accent-hover: #129546;
  --ds-accent-soft: #eaf7ee;
  --ds-accent-soft-2: #daf4e0;
  --ds-accent-text: #11823c;

  --ds-danger: #d64545;
  --ds-danger-soft: #fdecec;
  --ds-warning: #c9771a;
  --ds-warning-soft: #fff3e5;
  --ds-info: #2f7fd3;
  --ds-info-soft: #eaf2fc;

  --ds-cta-bg: #121212;
  --ds-cta-bg-hover: #1e1e1e;
  --ds-cta-text: #ffffff;
}
```

### 2. Typography

Use one neutral sans stack for production consistency:

```css
--ds-font-sans: "Geist", "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
```

Type scale:

1. Display: `56/60`, weight `700`
2. H1: `36/44`, weight `650`
3. H2: `28/36`, weight `600`
4. H3: `22/30`, weight `600`
5. Body-lg: `18/28`, weight `400`
6. Body: `14/22`, weight `400`
7. Label: `13/18`, weight `500`
8. Caption: `12/16`, weight `500`

### 3. Radius scale

1. `--ds-radius-xs: 6px`
2. `--ds-radius-sm: 8px`
3. `--ds-radius-md: 10px`
4. `--ds-radius-lg: 12px`
5. `--ds-radius-xl: 16px`
6. `--ds-radius-shell: 14px` (main panel)
7. `--ds-radius-pill: 999px`

### 4. Spacing scale

1. `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`
2. Core app grid and section spacing must use this scale only.

### 5. Elevation

1. Base: no shadow
2. Surface: `0 1px 1px rgba(0,0,0,0.02)`
3. Overlay: `0 8px 24px rgba(0,0,0,0.08)`

### 6. Motion

1. Fast interaction: `120ms ease-out`
2. Standard transition: `180ms ease-out`
3. Overlay/dialog: `220ms cubic-bezier(0.22, 1, 0.36, 1)`
4. No springy or playful motion in app surfaces

### 7. Control heights

1. Compact control: `h-8` (`32px`)
2. Default control: `h-9` (`36px`)
3. Prominent control: `h-10` (`40px`)

---

## Layout Architecture

### Desktop shell geometry

1. App canvas color: `--ds-canvas`
2. Sidebar width expanded: `304px` to `320px`
3. Sidebar width collapsed: `72px`
4. Main panel outer margin from viewport: `12px`
5. Main panel corner radius: `--ds-radius-shell`
6. Main panel background: `--ds-surface`
7. Main panel border: `1px solid --ds-border-soft`

### Main content frame

1. Header row inside panel: `56px` height when present
2. Standard content max width: `1280px`
3. Default content padding: `24px` desktop, `16px` tablet
4. Vertical section gap: `24px`

### Responsive behavior

1. Tablet (`<1024px`): sidebar may collapse by default
2. Mobile (`<768px`):
   - Use sheet/drawer sidebar
   - Keep same color tokens and control styling
   - Keep top identity and bottom utility grouping in drawer

### Surface layering

1. App shell layers:
   - Layer 0: canvas
   - Layer 1: sidebar
   - Layer 2: main panel
   - Layer 3: overlays/dialogs/popovers
2. Popovers and dialogs must always use solid surfaces, not translucent blends.

---

## Sidebar System Specification

### Required structure

The sidebar must be split into three zones:

1. Top zone
   - Avatar and user/workspace name
   - Profile/settings quick entry
   - Optional role switcher for admin users
2. Middle zone
   - Group labels
   - Main navigation items
   - Active item state with mint tint
3. Bottom zone
   - Documentation/help/support/settings utilities
   - User account menu entry

### Visual rules

1. Sidebar background: `--ds-sidebar-bg`
2. Sidebar text default: `--ds-text-secondary`
3. Sidebar icon default: same as text
4. Active nav item:
   - Background: `--ds-accent-soft`
   - Text/icon: `--ds-accent-text`
   - Radius: `--ds-radius-sm`
5. Group labels use caption style and tertiary text

### Behavior rules

1. Collapsed mode must preserve recognizable icons
2. Tooltips required for collapsed icon-only items
3. Keyboard focus ring is mandatory and visible
4. Top and bottom blocks remain anchored during scrolling

---

## Component Library Spec

All components must use foundation tokens and spacing scale.

### 1. Buttons

Variants:

1. Primary: dark background (`--ds-cta-bg`), white text
2. Secondary: white surface, soft border
3. Ghost: transparent, subtle hover fill
4. Destructive: soft red or solid red depending context

States:

1. Default
2. Hover
3. Active
4. Focus-visible
5. Disabled
6. Loading

### 2. Inputs and Selects

1. Height default: `36px`
2. Border: `--ds-border-strong`
3. Surface: white
4. Placeholder: tertiary text
5. Focus: clear ring and border shift

### 3. Toggles, switches, checkboxes

1. Off state neutral
2. On state accent green
3. Disabled opacity with maintained contrast

### 4. Badges and chips

Styles:

1. Success: green soft + green text
2. Warning: amber soft + amber text
3. Error: red soft + red text
4. Neutral: muted gray

### 5. Cards and section containers

1. Surface white
2. Soft neutral border
3. Radius `12px` or `16px` depending hierarchy
4. Minimal shadow, mostly border-defined depth

### 6. Table system

Rules:

1. Header row light-muted background
2. Row separators soft neutral
3. Hover row subtle tint only
4. Compact vertical rhythm
5. Status pills inside cells
6. Optional expandable rows for logs/details

### 7. Forms

1. Label above control
2. 12px vertical gap between label and field
3. 16px to 24px gap between field groups
4. Validation helper text below field

### 8. Alerts and toasts

1. Top-right toast pattern with solid white container
2. Border-based status communication
3. Include icon + title + short description

### 9. Menus, popovers, command palette, date picker

1. Rounded container (`12px`)
2. White background
3. Soft border
4. Overlay shadow level 3 only
5. Keyboard navigation styles mandatory

### 10. Dialogs and modals

1. Backdrop dim level low to medium
2. Dialog container white, rounded `16px`
3. Header/body/footer spacing consistent
4. Primary action right-aligned

### 11. Charts and analytics

1. Primary line and bars use accent green
2. Secondary data series use neutral supporting hues
3. Gridlines subtle
4. Axis labels tertiary text
5. Tooltip white with soft border

---

## Page Blueprints

### A. Landing pages

Composition:

1. Slim top navigation
2. Green-soft hero background with strong headline
3. Primary and secondary CTA pair
4. Product preview frame beneath hero
5. Trust/feature sections below

### B. Auth pages

Split layout:

1. Left: auth form card stack
2. Right: branded visual with green-toned product preview
3. Keep legal/help links minimal and low-contrast

### C. Requester workspace

Templates:

1. `/requester` overview dashboard
2. `/requester/datasets` management table with filters and bulk actions
3. `/requester/datasets/new` creation flow
4. `/requester/datasets/[id]` detail workspace
5. `/requester/analytics` KPIs and trends
6. `/requester/billing` plans, ledger, balance
7. `/requester/settings` profile/org/API keys
8. `/requester/support` ticket list and form
9. `/requester/files` exports/downloads

### D. Contributor workspace

Templates:

1. Contributor overview
2. Contributions list
3. Earnings and payouts
4. Contributor settings

Visual language must remain in same shell and token system as requester workspace.

### E. Admin workspace

Templates:

1. `/admin` overview
2. `/admin/requests`
3. `/admin/submissions`
4. `/admin/datasets`
5. `/admin/users`
6. `/admin/payments`
7. `/admin/analytics`
8. `/admin/settings`
9. `/admin/activity`

---

## Route and Component Migration Map

### 1. Requester route migration (legacy to canonical)

| Legacy requester route | Canonical route |
| --- | --- |
| `/dashboard` (requester context) | `/requester` |
| `/dashboard/requests` | `/requester/datasets` |
| `/dashboard/requests/new` | `/requester/datasets/new` |
| `/dashboard/requests/[id]` | `/requester/datasets/[id]` |
| `/dashboard/analytics` | `/requester/analytics` |
| `/dashboard/billing` | `/requester/billing` |
| `/dashboard/settings` | `/requester/settings` |
| `/dashboard/contributors` | `/requester/analytics` (temporary parity mapping in refactor phase) |

Target-state contract: requester-facing IA must use `/requester/*` only.

### 2. Component consolidation map

| Legacy component area | Target canonical area | Action |
| --- | --- | --- |
| `components/dashboard/app-sidebar.tsx` | `components/app/app-sidebar.tsx` | Retire legacy duplicate |
| `components/dashboard/*` shell-specific wrappers | `components/app/*` shell + role page modules | Consolidate shell primitives |
| scattered route href constants | shared navigation config | Centralize |

### 3. Refactor order (priority)

1. Tokens in `globals.css`
2. Shell and sidebar
3. Core primitives (button/input/card/table/menu/dialog)
4. Requester pages
5. Contributor pages
6. Admin pages
7. Landing and auth polish pass

---

## Agent Refactor Rules

### Rule set

1. Apply tokens first, then layouts, then components, then page composition.
2. Do not introduce ad-hoc color, spacing, radius, or shadow values if token exists.
3. Do not mix legacy and new sidebar composition on the same surface.
4. Keep interaction accessibility intact while restyling:
   - focus-visible states
   - keyboard navigation
   - disabled semantics
5. Do not add dark mode in this phase.
6. Keep PWA untouched in this phase.
7. Keep visual output close to screenshot language, not generic default SaaS look.

### Code-level conventions

1. Prefer `components/app/*` for shared shell behavior.
2. Keep role-specific page logic in role folders.
3. Use shared UI primitives from `components/ui/*`.
4. Keep route references centralized to avoid drift.

---

## Acceptance Checklist

Refactor work is accepted only when all checks pass.

### Visual fidelity

1. App canvas and panel colors match token contract.
2. Sidebar matches top-middle-bottom structure.
3. Active navigation uses mint-tint treatment.
4. Primary CTA style is dark with high contrast.
5. Tables/forms/cards align with screenshot density and borders.

### IA and routing

1. Requester pages are canonical under `/requester/*`.
2. Legacy requester `/dashboard/*` pages are removed from target-state IA usage.
3. Contributor and admin workspaces preserve role-specific navigation and shell consistency.

### Component completeness

1. Core primitives (`button`, `card`, `table`, `input`, `sidebar`, `dropdown`, `badge`, `dialog`, `tabs`) all follow documented states and anatomy.
2. No unthemed primitives remain on app surfaces.

### Accessibility and quality

1. Keyboard navigation works in sidebar, menus, dialogs, command palette.
2. Focus rings are visible on all interactive controls.
3. Text contrast remains readable on all status surfaces.
4. Responsive behavior stable at desktop, tablet, and mobile breakpoints.

---

## Validation Scenarios for Future Agent Runs

1. Verify every route family has a declared blueprint section before refactor.
2. Verify each page uses shell contract and token system, no legacy styling islands.
3. Verify requester migration map is fully applied.
4. Verify sidebar anchoring:
   - profile at top
   - navigation in middle
   - settings/utilities at bottom
5. Verify document still contains explicit "light mode only" scope.
6. Verify each section remains implementation-directed, not generic design prose.

---

## Locked Assumptions

1. `frontend-design` skill quality bar applies to all generated UI.
2. Fidelity target remains near-identical to provided screenshots.
3. Canonical IA is requester-first.
4. Requester legacy `/dashboard/*` paths are deprecated in target-state contract.
5. Scope is landing + web app only.
6. Theme scope is light-only.
7. Deliverable in this phase is this documentation spec, not direct UI code edits.

