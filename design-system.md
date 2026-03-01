# Caudals Design System v2

Status: Target system for full UI/UX refactor of `caudals.com` and `app.caudals.com`.
Source of truth: This file.
Visual reference: The Steep screenshots you attached (minimal neutral canvas, editorial serif marketing moments, precise analytics UI).

## 1. Product Context (From Current Repo)

### 1.1 Platform purpose
Caudals is a full-stack AI dataset operations platform where:
- Requesters create dataset briefs and fund them.
- Contributors submit files/data samples.
- Requesters/admins review and approve submissions.
- Stripe-backed payments/payouts and ledgering happen through `transactions`, `wallets`, `stripe_accounts`.
- Teams export approved datasets.

### 1.2 Current domain model (already in codebase)
Core entities already present or scaffolded:
- `dataset_requests`
- `submissions`
- `profiles`
- `transactions`
- `wallets`
- `stripe_accounts`
- `waitlist_signups`
- Requester extensions in migrations: `dataset_templates`, `dataset_exports`, `dataset_activity`, `requester_onboarding_progress`, `requester_org_settings`, `requester_api_keys`, `support_tickets`.

### 1.3 Surface areas
- Marketing: `/`, `/browse`, `/collaborate`, auth pages.
- App shell (authenticated): `/dashboard`, `/requester/*`, `/admin/*`, contributor surfaces, PWA pages.
- Host split in middleware:
  - Marketing hostnames: `caudals.com`, `www.caudals.com`
  - App hostnames: `app.caudals.com`, `www.app.caudals.com`

### 1.4 Design implication
The new system must support both:
- High-conviction brand storytelling (marketing).
- High-density operational analytics workflows (app).

---

## 2. Visual Direction (Match Screenshots)

### 2.1 Core aesthetic
"Editorial analytics":
- Light, neutral, low-chroma base.
- Strong black typography and controls.
- Soft card surfaces with hairline borders.
- Sparse but intentional accent color in charts and status cues.
- Premium serif moments only where brand voice needs emphasis (hero headlines, major section titles).

### 2.2 Non-negotiables
- No dark mode in v2 initial rollout.
- No loud gradients in core app shell.
- No glassmorphism, blur-heavy chrome, or neon accents.
- No over-rounded "playful" UI.
- No purple-first palette.
- App UI stays operational and understated; visual expression is controlled through type, spacing, and surface hierarchy.

---

## 3. Foundations

## 3.1 Color system

### Base neutrals
- `--cdl-bg-canvas: #F5F5F4`
- `--cdl-bg-subtle: #F0F0EE`
- `--cdl-bg-surface: #FFFFFF`
- `--cdl-bg-surface-alt: #FAFAF9`
- `--cdl-border-soft: #E3E3DF`
- `--cdl-border-strong: #D1D1CC`
- `--cdl-ink-primary: #141518`
- `--cdl-ink-secondary: #6E7076`
- `--cdl-ink-tertiary: #9A9CA3`

### Functional accents
Use accents sparingly and semantically:
- `--cdl-accent-green-700: #2F5E37`
- `--cdl-accent-green-500: #4E8A5B`
- `--cdl-accent-blue-700: #2B568D`
- `--cdl-accent-blue-500: #4E7FC2`
- `--cdl-accent-amber-600: #AE7B2D`
- `--cdl-accent-red-600: #B44C4C`

### Brand CTA blacks
- `--cdl-action-bg: #111318`
- `--cdl-action-text: #FFFFFF`

### Semantic tokens (map to shadcn variables)
- `--background: var(--cdl-bg-canvas)`
- `--card: var(--cdl-bg-surface)`
- `--foreground: var(--cdl-ink-primary)`
- `--muted: var(--cdl-bg-subtle)`
- `--muted-foreground: var(--cdl-ink-secondary)`
- `--border: var(--cdl-border-soft)`
- `--primary: var(--cdl-action-bg)`
- `--primary-foreground: var(--cdl-action-text)`
- `--accent: var(--cdl-bg-subtle)`
- `--accent-foreground: var(--cdl-ink-primary)`

## 3.2 Typography

### Font families
Preferred (closest to screenshot feel):
- Display serif: `Instrument Serif` (fallback: `Iowan Old Style`, `Georgia`, serif)
- UI sans: `Manrope` (fallback: `Inter`, `Helvetica Neue`, sans-serif)
- Mono: `JetBrains Mono`

Optional premium alternatives:
- Display serif: Canela or Noe Display.
- UI sans: Sohne or Suisse Int'l.

### Type roles
- Hero display (marketing): 72/76, 64/68, 48/52 (desktop cascade)
- Section heading serif: 56/60, 44/48, 36/40
- App page title sans: 40/44, 32/36, 28/32
- App section title: 24/30
- Body M: 18/28
- Body S: 16/24
- UI compact: 14/20
- Meta/caption: 12/16

### Weights
- 400 regular
- 500 medium
- 600 semibold
- 700 bold

## 3.3 Spacing scale
4px base unit:
- 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96

Application:
- Sidebar item vertical rhythm: 8
- Form row spacing: 12 or 16
- Card padding compact: 16
- Card padding standard: 20
- Panel padding: 24
- Page horizontal gutters: 24 (tablet), 32 (desktop), 40 (wide desktop)

## 3.4 Radius, border, shadow
- Radius XS: 8
- Radius S: 10
- Radius M: 12
- Radius L: 16
- Radius XL: 20
- Radius should never exceed 20 in app surfaces.

Borders:
- Hairline default: 1px `--cdl-border-soft`
- Strong separators: 1px `--cdl-border-strong`

Shadows:
- Default cards: none or ultra-soft (`0 1px 2px rgba(17,19,24,0.04)`)
- Floating popovers/modals only: `0 8px 24px rgba(17,19,24,0.10)`

## 3.5 Iconography
- Use line icons (Lucide is acceptable).
- Stroke visual weight: 1.75-2.
- Icon sizes: 14, 16, 18, 20.

## 3.6 Motion
- Fast interaction: 120ms ease-out.
- Structural transitions (modal/open/close): 180ms.
- Page-level reveal: max 240ms, subtle fade/slide.
- Avoid spring/bouncy motion for app controls.

---

## 4. Layout System

## 4.1 Global app shell
Replicate screenshot geometry:
- Left sidebar: 232-248px expanded, icon-only collapsed state optional.
- Top app bar: 52-56px height.
- Main content max-width: 1160-1240px centered within shell.
- Content sections use stacked cards with consistent 16-24 spacing.

## 4.2 Marketing shell
- Horizontal nav centered around logo.
- Optional top announcement strip (dark with white text).
- Hero with large whitespace and centered editorial copy.
- Product screenshot montage anchored below hero fold.

## 4.3 Grid standards
- Marketing sections: 12-column responsive grid.
- App content: 12-column with common 8/4 splits and 3-up metric card layouts.

---

## 5. Component Specifications

## 5.1 Navigation

### Marketing header
- Transparent/light header with border-bottom subtle.
- Left/center/right balance:
  - Left: primary nav links
  - Center: logo
  - Right: demo/login/get-started
- Primary CTA is always black-filled pill/rounded-rect.

### App sidebar
- Neutral background (`--cdl-bg-canvas`).
- Section labels uppercase, muted.
- Active item: subtle filled row (`--cdl-bg-subtle`) with stronger text.
- Nested metric categories: indented 12-16px and lighter disclosure indicators.

## 5.2 Buttons

Variants:
- Primary: black background, white text.
- Secondary: white background + soft border.
- Ghost: transparent.
- Destructive: muted red text/border, not saturated.

Sizes:
- `sm` 32h
- `md` 40h
- `lg` 46h

Shape:
- 10-12 radius.

## 5.3 Inputs and forms
- Height 44 for default text inputs.
- Fill: white or very light neutral.
- Border: `--cdl-border-soft`.
- Focus ring: 1px + outer subtle ring in blue/neutral, never neon.
- Labels above fields, 14px medium.
- Required marker uses `*` muted but visible.

## 5.4 Tables (metrics catalog, lists)
- Column header: 14 semibold.
- Row height: 56-64.
- Row separators only; avoid heavy boxed grids.
- Status/category chips align to center-left in row.
- Hover row uses very light surface tint.

## 5.5 Chips / badges / pills
- Soft filled backgrounds for category/status.
- Default chip radius: 999px.
- Dense chips inside filter builders should use 24-28 height.

## 5.6 Cards and widgets
Card levels:
- Level 1 section container: larger radius 16, full panel.
- Level 2 metric widget: radius 12, subtle surface contrast.
- Level 3 utility tile: radius 10.

Metric widget anatomy (from screenshots):
1. Label row (title + menu icon)
2. Primary metric number
3. Change indicator (`+/-` + period comparator)
4. Embedded micro chart
5. Time chip/tag where needed

## 5.7 Charts and dataviz
- Chart background remains neutral.
- Line charts: 2px stroke, rounded caps.
- Area fills: low-opacity vertical fades.
- Bars: rounded top corners only.
- Grid lines: dashed/light gray.
- Current period marker uses small filled pill (e.g., "Aug").
- Max 2 comparative lines in default widgets.

Color mapping:
- Primary performance: green or blue depending domain.
- Comparison series: muted counterpart.
- Negative trend text: red-600.
- Positive trend text: green-700.

## 5.8 Modals and overlays
- Modal width presets: 560, 760, 980.
- Header sticky with explicit left cancel and right primary action.
- Content sections separated by 1px rules.
- Backdrop: neutral black at 24-32%.
- Dialog corners: 16.

Key modal archetypes to support:
- Select metric
- Edit widget
- Date range picker
- New metric builder

## 5.9 Empty and onboarding states
- Centered illustration + strong serif heading allowed.
- 1 primary + 1 secondary action max.
- Add support options in low-contrast container below CTA.

## 5.10 Help center layout
- Three-column content:
  - Left: section navigation tree
  - Center: article content
  - Right: "On this page" anchors
- Article title in serif display.
- Body in readable sans, 16/28.

---

## 6. Page Archetypes (Target Templates)

## 6.1 Marketing homepage (`/`)
Sections order:
1. Top announcement bar (optional)
2. Navbar
3. Hero (editorial serif with one italic accent word)
4. Dual CTA row
5. Product montage frame (desktop + mobile mock)
6. Proof/feature sections
7. Pricing
8. FAQ
9. Footer

## 6.2 Requester home (`/requester`)
- Persistent shell + left sidebar.
- Top-level workspace container card.
- First block: key widgets (order volume, registrations, NPS-like tiles).
- Add widget action row.
- Reports card.
- Team sections stacked below.

## 6.3 Dataset workspace (`/requester/datasets/*`)
- Header with title + status + primary action.
- KPI widgets in grid.
- Review queue table.
- Automation/config panel in right or lower section.

## 6.4 Metrics catalog (admin/requester analytics)
- Header + category chips + search.
- List table with metric name, category, owner.
- New metric button in top-right black style.

## 6.5 Metric editor/new metric
- Main canvas left for preview/chart/query.
- Sticky right settings inspector with grouped controls.
- Save/Cancel anchored in top bar.

## 6.6 Help center (`/help` equivalent)
- Same structure as screenshot reference.
- Large product visual at top of article region.
- Intro sections with serif heading and clear left/right nav rails.

## 6.7 Contact/demo form page
- Two-column split:
  - Left: large serif headline + short subcopy
  - Right: stacked form fields + black submit button
- Entire content on soft neutral panel.

---

## 7. Content & Voice

## 7.1 Tone
- Calm, precise, operational.
- No hype-heavy AI wording.
- Prefer direct value statements:
  - "Define metrics once"
  - "Review submissions faster"
  - "Export vetted data"

## 7.2 Writing rules
- Keep CTAs short: 2-4 words.
- Use sentence case.
- Avoid exclamation overuse (except special onboarding empty states).

---

## 8. Accessibility Requirements

- Minimum text contrast WCAG AA.
- All actionable icons include visible labels or tooltip+aria label.
- Keyboard navigation for all menus, dialogs, tables.
- Focus rings always visible on keyboard input.
- Chart insights must have textual counterpart (numbers and trend labels).

---

## 9. Technical Implementation Rules (For AI Refactor Agents)

## 9.1 Token-first implementation
1. Define all tokens in `app/globals.css` using CSS custom properties.
2. Map tokens to existing shadcn semantic variables.
3. Remove old accent-heavy gradients from app surfaces.

## 9.2 Font migration
- Replace current default display moments with `Instrument Serif`.
- Keep app UI in `Manrope` (or approved UI sans).
- Use one serif and one sans only.

## 9.3 Component standardization
- Refactor repeated card/table/form variants into shared primitives.
- Use consistent border/radius/spacing primitives.
- Do not create page-specific visual one-offs unless approved.

## 9.4 Route-by-route rollout order
1. `app/(home)/page.tsx` and landing sections.
2. `components/ui/header.tsx` + marketing footer.
3. App shell: `components/app/app-shell.tsx`, sidebar/header.
4. Requester routes (`/requester/*`) + dataset workflows.
5. Dashboard legacy routes (`/dashboard/*`) migration to same visual system.
6. Admin and PWA harmonization.

## 9.5 Data-UI alignment
Design components must directly represent real entities:
- Datasets
- Submissions
- Exports
- Billing transactions
- Onboarding steps
- Support tickets

No fake placeholder cards in production pages.

---

## 10. QA Checklist for Each Refactored Screen

- Uses v2 tokens only.
- Correct typography pairing and scale.
- Correct shell spacing and border language.
- Buttons/inputs/chips match component spec.
- Empty/loading/error states present.
- Mobile layout works at 390px width.
- Keyboard and focus behavior validated.
- No saturated or non-system accent colors introduced.

---

## 11. Tailwind + CSS Token Starter Snippet

```css
:root {
  --cdl-bg-canvas: #f5f5f4;
  --cdl-bg-subtle: #f0f0ee;
  --cdl-bg-surface: #ffffff;
  --cdl-border-soft: #e3e3df;
  --cdl-border-strong: #d1d1cc;
  --cdl-ink-primary: #141518;
  --cdl-ink-secondary: #6e7076;
  --cdl-action-bg: #111318;
  --cdl-action-text: #ffffff;

  --background: var(--cdl-bg-canvas);
  --foreground: var(--cdl-ink-primary);
  --card: var(--cdl-bg-surface);
  --card-foreground: var(--cdl-ink-primary);
  --muted: var(--cdl-bg-subtle);
  --muted-foreground: var(--cdl-ink-secondary);
  --border: var(--cdl-border-soft);
  --input: var(--cdl-border-soft);
  --primary: var(--cdl-action-bg);
  --primary-foreground: var(--cdl-action-text);
  --radius: 0.75rem;
}
```

---

## 12. Do / Don't Summary

Do:
- Keep it minimal, premium, and information-first.
- Use serif strategically for hero and major editorial titles.
- Let spacing and typography carry hierarchy.
- Use accent colors mainly in charts and status.

Don't:
- Overuse gradients or glows.
- Create oversized playful radii in app controls.
- Use generic startup purple palettes.
- Mix many visual styles per page.

---

## 13. Definition of Done for Design System Adoption

This design system is considered adopted when:
- Landing and requester app are visually coherent under one token system.
- All core workflows (Create dataset -> Review -> Fund -> Export -> Support) use standardized components.
- Screens are visually aligned with the attached Steep references while preserving Caudals product language and domain model.
- The codebase can be extended by AI agents without introducing style drift.
