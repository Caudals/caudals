# Caudals Design System

Two design languages live in this repository. They are deliberately different and must not be blended.

| | **Platform** | **Marketing** |
| --- | --- | --- |
| Surfaces | `app.caudals.com` — `/workspace/*`, `/ops/*`, `/share`, `/evaluation-entry`, `/auth/*`, `/admin` | `caudals.com` — `/`, `/contact`, `/call`, `/blog`, `/newsletter`, `/legal/*` |
| Character | Dense, neutral, instrument-like. An evidence tool. | Editorial, calm, typographic. A point of view. |
| Source of truth | `packages/brand/platform.css` | `packages/brand/tokens.css`, `app/globals.css` |
| Governed by | **§1–§12 of this document** | **§13 of this document** |

This document is the authority for both. Where it and the code disagree, fix the code.

---

# Part I — The Platform

## 1. Agent instructions

Read this before writing any platform UI.

1. **Compose, do not invent.** Build from `components/evals/primitives.tsx`. If the screen needs something the kit does not have, add it *to the kit* and document it here — never style inline, never add a one-off class in a component file.
2. **Never hand-roll a value.** Every colour, radius, shadow, duration, easing, font size and tracking value comes from a `--p-*` token in `packages/brand/platform.css`. A literal `#hex`, `12px` radius or `300ms` in a component is a defect.
3. **No webfonts.** The native system stack, tuned. See §4.
4. **Monochrome chrome, semantic colour.** Black primary actions, greyscale everything else. A colour on screen is reporting a verdict, a severity or a chart series. If it is decorating, delete it.
5. **Never show a raw enum.** `needs_review` reaches a customer as a "Needs review" pill, via `StatusBadge`. See §8.
6. **Colour is never the only signal.** Every verdict is a colour *and* a word.
7. **Exact motion values.** `cubic-bezier(0.23, 1, 0.32, 1)` is not `ease-out`. `0.97` is not `0.95`. Use what §10 says.
8. **Do not import `platform.css` into a marketing route**, and do not import `globals.css` tokens into a platform component.

## 2. Origin and intent

The language is modelled on ElevenLabs' dashboards: a warm off-white chrome, a floating white content canvas, a quiet icon sidebar, near-black primary actions, and status carried entirely by small pills. It was chosen because it is the right dress for what Caudals sells — dense, checkable evidence read under time pressure — not because it is fashionable.

Three principles follow from that:

**Instrument, not brochure.** The platform reports findings. It does not persuade. No hero copy, no gradients, no illustration, no emoji.

**Every pixel of colour is a claim.** In a report about whether an AI system passes or fails, a green pill is data. Spending green on a decorative accent devalues the green that means "pass".

**Quiet chrome, loud content.** The shell recedes to a single grey plane. The content canvas is the only bright surface on screen.

## 3. The three planes

The single most recognisable move in the language. Keep them distinct.

```
┌─ chrome  #f3f3f1 ─────────────────────────────────────────┐
│ sidebar          ┌─ canvas  #ffffff, r14, shadow-border ─┐│
│ (transparent,    │                                       ││
│  no border)      │  ┌─ card  #ffffff, r12, shadow ────┐  ││
│                  │  └──────────────────────────────────┘  ││
│ account chip     └───────────────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
```

1. **Chrome** (`--p-chrome`) — the window backdrop, shared by the sidebar and the topbar. The sidebar sits flush on the chrome plane with no right border, while the topbar breadcrumb is offset to the right to maintain clear visual separation between navigation zones.
2. **Canvas** (`--p-canvas`) — a rounded white panel, `--p-radius-xl`, `--p-shadow-border`, `8px` inset from the right and bottom of the viewport, scrolling independently of the shell.
3. **Content** — cards, tables and tiles inside the canvas.

### The sidebar and its rail

The sidebar has two states, and **the control that switches them lives inside the sidebar**, never in the topbar.

| | Expanded | Rail |
| --- | --- | --- |
| Width | `--p-sidebar-w` `256px` | `--p-sidebar-w-rail` `68px` |
| Brand | `caudals_logo_black.svg` (20×20) + text | `caudals_logo_black.svg`, 22×22 |
| Header | brand and toggle side by side | brand above toggle, both centred |
| Nav item | 36px tall, 18px icon, 14px label | 44px square, icon only, label as `title` |
| Group label | text | a hairline rule — a heading above every icon is noise |
| Account chip | avatar, name, workspace | avatar only |

The state persists per device in `localStorage` under `caudals.sidebar`. Every read and write is wrapped in try/catch: private mode and blocked storage must fall back to expanded, not throw.

**A collapsed label stays in the DOM.** Only its presentation collapses (`max-width: 0; opacity: 0`), so the link keeps its accessible name and a screen reader still hears "Reports". `title` gives sighted mouse users the same information the visible label used to.

**Brand assets** live in `public/`: `caudals-logo-wordmark.png` (mark + "Caudals", 3212×1080) and `caudals-logo-icon.png` (the three-bar mark, 1080×1080). `caudals_logo_black.svg` is the mark in vector. Never redraw the mark in CSS and never set `alt` on the lockup inside a link that already has an `aria-label` — that would announce the name twice.

Those two files plus `caudals-brand.png` shipped as mode `600`, which made them unreadable to the server process and rendered as broken images in the deployed app while working fine in the harness. Everything in `public/` must be world-readable; `find public -type f ! -perm -o+r` should return nothing.

**The sidebar carries larger type than the rest of the platform**: 14px nav labels against the 13px used for buttons and fields, 18px icons against 15–16px elsewhere, 36px rows. The sidebar is read at a glance from the corner of the eye, not studied, so it takes one step up the scale.

## 4. Typography

No webfonts. `--p-font` is the native stack, tuned with tight display tracking and `font-variant-numeric: tabular-nums` globally so evidence columns align.

| Token | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `--p-text-display` | 30px | 600 | `-0.03em` | Page title (`h1`), one per page |
| `--p-text-title` | 20px | 600 | `-0.021em` | Section heading, dialog title |
| `--p-text-subtitle` | 16px | 600 | `-0.021em` | Card heading, empty-state title |
| `--p-text-body` | 14px | 400 | `-0.006em` | Body, table cells, inputs |
| `--p-text-label` | 13px | 500 | `-0.006em` | Field labels, buttons, nav |
| `--p-text-micro` | 12px | 400–500 | `0` | Table headers, badges, meta |
| `--p-text-nano` | 11px | 500 | `0` | Avatar initials, menu labels, source refs |

Rules:

- **Headings are semibold (600), not regular.** This is the clearest break from the marketing language, where headings are 400. Do not carry the editorial weight across.
- Tracking tightens as size grows and never goes negative below 14px.
- Measure caps at `62ch` for descriptions, `42ch` for empty-state copy.
- The one oversized number is the report pass rate, `.eval-score`: `clamp(42px, 8vw, 66px)` / 600 / `-0.045em`.
- Never uppercase a label. The reference uses sentence case throughout, and uppercase costs legibility in dense tables.

## 5. Colour

### Chrome — monochrome

| Token | Value | Use |
| --- | --- | --- |
| `--p-chrome` | `#f3f3f1` | Window backdrop, sidebar |
| `--p-canvas` / `--p-surface` | `#ffffff` | Content canvas, cards |
| `--p-surface-2` | `#f7f7f5` | Hover fill, segmented track, code blocks |
| `--p-surface-3` | `#edece9` | Active nav pill, pressed state |
| `--p-text` | `#0c0c0b` | Primary type, primary action fill |
| `--p-text-secondary` | `#6d6d68` | Descriptions, table headers, idle nav |
| `--p-text-tertiary` | `#9a9a94` | Placeholders, group labels, timestamps |
| `--p-action` | `#0c0c0b` | Primary button, focus ring, active indicator |

Greys are **warm** (a green-red bias, not blue). A cool grey against `#f3f3f1` reads dirty.

### Semantic — the only colour on screen

| Tone | Text | Fill | Means |
| --- | --- | --- | --- |
| `pass` | `#15803d` | `#f0fdf4` | Passed, ready, connected, published |
| `warn` | `#b45309` | `#fffbeb` | Needs review, paused, partial, pairing required |
| `fail` | `#b91c1c` | `#fef2f2` | Failed, unsupported, timed out, critical |
| `info` | `#1d4ed8` | `#eff6ff` | Running, queued, validating — in flight |
| `neutral` | `#57534e` | `#f5f5f4` | Pending, draft, cancelled, unknown |

Charts use `--p-chart-1..5`, ordered by use. A single-series chart is `--p-chart-1` (near-black), never a colour.

**Emerald is gone from the platform.** It survives only as `pass`. The marketing site keeps it as a brand accent (§13); that is intentional divergence, not drift.

### Dark mode

Authored, not shipped. Every value that changes is redeclared under `:root[data-theme="dark"]`. Light remains the single source for scale, radii and motion. To enable: set `data-theme="dark"` on `<html>` (`next-themes` is already a dependency), then QA every screen — nothing else should need to change. On dark, the layered depth shadow collapses to a single white ring, because layered shadows are invisible on dark surfaces.

## 6. Space, radius and elevation

**Radii** — `xs 6 · sm 8 · md 10 · lg 12 · xl 14 · 2xl 18 · pill 999`. Nothing outside this scale.

**Concentric rule: outer radius = inner radius + padding.** Mismatched radii on closely nested surfaces is the most common thing that makes an interface feel subtly wrong. The pairs in the system already satisfy it:

| Outer | Padding | Inner |
| --- | --- | --- |
| Menu `12` | `5` | Menu item `8` |
| Segmented track `10` | `3` | Selected thumb `6` |
| Card `12` | `20` | — past 24px of padding, treat the layers as independent |

**Elevation is a shadow; structure is a border.**

- `--p-shadow-border` — a three-layer ring + lift + ambient pool. This is what a card, button or chip gets *instead of* a `1px solid` border. It is transparent, so it adapts to whatever sits behind it; a fixed border colour cannot.
- `--p-shadow-border-hover` — the same, one step stronger. Transition `box-shadow` only.
- `--p-shadow-raise` — the selected segmented thumb.
- `--p-shadow-overlay` — menus, dialogs, drawers.

Keep a real `border` only where it separates: table row rules, the tab underline, input outlines, list dividers.

**Layout constants** — sidebar `256px` (rail `68px`), topbar `48px`, content max `1360px`, page padding `40px 32px 96px` (desktop) / `28px 20px 72px` (mobile), frame gap `8px`.

The content measure is wide on purpose: these are evidence tables with four to six columns, and a narrow column forces horizontal scrolling on exactly the screens that need scanning most.

## 7. The component kit

`components/evals/primitives.tsx`. Import from here; do not reach for `components/ui/*` directly in a new platform screen.

| Component | Renders | Notes |
| --- | --- | --- |
| `Action` / `ActionLink` | `.p-btn` | `variant` primary·secondary·ghost·danger, `size` sm·md·lg, `shape` default·pill·icon, `block` |
| `Chip` | `.p-chip` | Filter affordance, `+ Label`, pill, `active` |
| `PageHeading` | `.p-head` | `title`, optional `actions` (top-right), description as children |
| `SectionHeading` | `.p-section-head` | Same shape, one level down |
| `Card` | `.p-card` | Optional `title` + `actions` |
| `Tabs` | `.p-tabs` | `variant` underline (default) or pill |
| `Toolbar` | `.p-toolbar` | Filter row under the heading |
| `Badge` | `.p-badge` | `tone`, `dot`, `live` |
| `StatusBadge` | `.p-badge` | **Use for every domain status.** See §8 |
| `Status` | `.p-status` | Inline banner, `tone` error·success·warn·info |
| `Loading` | `.p-status` + spinner | Indeterminate wait, reads as a sentence |
| `Progress` | `.p-progress` | Determinate, needs `label` |
| `Stat` / `StatGrid` | `.p-stat` | `label`, `value`, `meta`, `hero` |
| `DefinitionList` | `.p-defs` | Term/value rows |
| `Field` / `TextArea` / `SelectField` | `.p-field` | Label always present, `hint` optional |
| `InlineSelect` | `.p-toolbar-label` + `.p-field` | Toolbar-width select |
| `DataTable` / `RowTitle` | `.p-table` | Header may be `{ label, align: "end" }` |
| `EmptyState` | `.p-empty` | Icon in a rounded mark, title, copy, one CTA |
| `SessionRecovery` | — | Sign-in + recovery pair |

### Buttons

Height `36` (`sm 30`, `lg 42`), radius `--p-radius-md`, label `13px/500`.

- **primary** — `--p-action` fill, white text. One per page region.
- **secondary** — white, `--p-shadow-border`. The default for anything that is not *the* action.
- **ghost** — transparent, secondary text. Toolbars and icon buttons.
- **danger** — `--p-fail` fill. Destructive only.

Optical padding: a button with a leading or trailing icon takes `12px` on the icon side against `14px` on the text side. This is excluded for icon-only buttons — `:has()` inherits its argument's specificity and would otherwise outrank the icon shape's `padding: 0` and crush the glyph.

Icon stroke matches text weight: `1.5` beside 400, `2` beside 500/600. One icon library per surface — **lucide-react**, nothing else.

## 8. Status is a contract

A customer must never read `capture_incomplete`.

`StatusBadge` maps a domain value to a tone and a human label through the `STATUS` table in `primitives.tsx`. An unmapped value degrades to a humanised neutral pill rather than vanishing, so a new backend state is legible the day it ships — but **add the mapping** when you add the state.

```tsx
<td><StatusBadge value={evaluation.preparation_status} /></td>
```

In-flight states (`running`, `queued`, `validating`, `generating`, `checking_connection`) get a pulsing dot. Settled states get a static one. Nothing else on the platform pulses.

## 9. Layout patterns

**Standard page** — `PageHeading` (with `actions` for the primary CTA, top-right) → `Tabs` if the page has sections → `Toolbar` for filters → content → `EmptyState` when there is none. This is the shape of every reference screenshot and should be the shape of every list page here.

**Guided flow** (`.eval-flow`) — a `660px` centred column. Numbered step heading, one decision per card. Used by the new-evaluation wizard and test-set preparation.

**Inspector** (`.eval-results-layout`) — list left, sticky evidence pane right; collapses to a dialog under 1024px.

**Auth** (`.p-auth`) — one centred `400px` column on the chrome plane. Wordmark, title, description, card, footnote. No split hero, no marketing copy: the person is here to get in.

**Empty states** carry an icon in a 44px rounded mark, a title, one line of copy and at most one action. Never a bare sentence.

## 10. Motion

Exact values. `cubic-bezier(0.23, 1, 0.32, 1)` is not `cubic-bezier(0.4, 0, 0.2, 1)`.

| Token | Value | Use |
| --- | --- | --- |
| `--p-ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Anything entering, exiting or pressed |
| `--p-ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Movement across the screen |
| `--p-ease-crisp` | `cubic-bezier(0.2, 0, 0, 1)` | Colour and hover |
| `--p-dur-instant` | `120ms` | Hover, colour, high-frequency |
| `--p-dur-press` | `160ms` | Scale on press |
| `--p-dur-pop` | `180ms` | Dropdown, popover, tooltip |
| `--p-dur-modal` | `220ms` | Dialog, drawer |

Rules:

- **`scale(0.97)` on `:active`** for every pressable element. Exactly `0.97`.
- **Never `ease-in`** on UI. It delays the first frame — the moment the user is watching hardest — so it feels slower than `ease-out` at the same duration.
- **Never animate from `scale(0)`.** Start at `0.95`–`0.97` with opacity. Nothing in the real world appears from nothing.
- **Popovers scale from their trigger** (`transform-origin: var(--radix-*-transform-origin)`). **Modals stay centred** — they are not anchored to anything.
- **Transitions, not keyframes**, for anything interactive: transitions retarget mid-flight, keyframes restart from zero.
- **Name the properties.** `transition-property: box-shadow`, never `transition: all`.
- **Gate hover behind** `@media (hover: hover) and (pointer: fine)`. Touch devices fire hover on tap.
- Nothing over `300ms` for an interactive change.
- Reduced motion means *fewer and gentler*, not none: opacity and colour survive because they carry meaning; movement and scale do not.

**The sidebar collapse** is the one place two easings meet, and the split is deliberate. The rail *morphs* on screen, so `grid-template-columns` takes `--p-ease-in-out` over `--p-dur-modal`. The labels inside it are *exiting*, so they take `--p-ease-out` and go faster — `90ms` out — so text is gone before the rail finishes narrowing and never clips mid-glyph.

**A hidden control is still the hit target.** The radio inside a `.p-choice` card is `opacity: 0` but stretched over the whole card with `pointer-events` intact, so a click lands on the real control. Never `pointer-events: none` on an input you have visually hidden: it hands the interaction to a label, shrinks the target, and breaks assistive tech and automation alike.

**Menus are modal (the Radix default), and selecting an item closes them.** A modal menu `aria-hidden`s the shell behind it; if the menu stayed open after a selection, any status the shell then reported — a failed sign-out, say — would be invisible to assistive technology. Closing on select lifts the `aria-hidden` and the message lands.

## 11. Accessibility

- Focus is a `2px` solid `--p-focus` ring at `2px` offset. Visible on every interactive element. Never removed without an equivalent replacement.
- Minimum target `32px`; `36px` for primary actions.
- Every icon-only control has an `aria-label`. Every decorative icon has `aria-hidden="true"`.
- Tables use `<caption class="sr-only">` and `<th scope>`.
- Live regions: `role="status"` for progress, `role="alert"` for errors, `aria-live="polite"` on run progress.
- The skip link (`.p-skip`) is first in the shell and lands on `#p-main`.
- Colour never carries meaning alone (§1.6).

## 12. Interop and migration

The platform reuses the repo's shared shadcn components rather than forking them. Inside `.p-root`, `[data-slot="button"]`, `[data-slot="input"]` and the dialog/sheet chrome are restyled to this language, so a screen that has not yet migrated to the `p-*` primitives still looks right. `components/ui/button.tsx` emits `data-variant`/`data-size` purely so this remap can target it.

Two selector techniques appear throughout and are deliberate:

- **Doubled class** (`.p-menu.p-menu`) raises specificity to (0,2,0) so platform rules beat a Tailwind utility at (0,1,0) **on specificity rather than on stylesheet order**, which Next does not guarantee.
- **Tokens on `:root`, rules under `.p-root`.** Dropdowns, sheets and dialogs render through a portal at the end of `<body>`, outside `.p-root`. Custom properties declared but never referenced elsewhere cost nothing and inherit everywhere, which is exactly what portalled surfaces need.

**Compatibility layer.** `app/(evaluation)/evaluation.css` ends with an alias block mapping legacy `.eval-*` class names onto the platform language, so components not yet migrated stay consistent. **Do not add names to it.** When you touch one of those components, move it to the `p-*` primitives and delete its alias.

**`/admin` is frozen scope** (`AGENTS.md`). Its 1,191-line module tree is maintained, not rewritten. It adopts the platform tokens by remapping the shadcn variables it already consumes (`.p-root[data-surface="admin"]`), so it reads as the same product without touching its code. Migrate a module to the primitives when it is next opened for real work.

---

# Part II — Marketing

## 13. The public site

`caudals.com` uses the **Paper** language chosen from the 2026-09 redesign mockup (`c-design/landing-redesign`, variant 1 and the hero study): a calm research-report page, monochrome by rule.

- Tokens: `packages/brand/tokens.css` (`--ds-*`), consumed via `app/globals.css`. The landing adds its own scoped palette in `components/landing/landing.css` (`.lp`), with the same values.
- Warm paper canvas `#f5f4f0`, white paper `#ffffff` for sheets and bubbles, ink `#141413`, secondary ink `#3b3a36`, muted `#6b6a63` (4.9:1 on the canvas), hairlines `#dcdad3` / `#e9e7e1`.
- **No colour accent.** Teal and emerald are gone from every public surface; the `--ds-accent*` names remain for existing consumers and resolve to ink. A verdict is a solid ink cross or an outlined ink tick, always next to a word.
- Type: Geist for everything, titles included (400, tight tracking). Newsreader only for the hero's italic word, the problem statement and document excerpts. Geist Mono only for small figures inside diagrams. Loaded with `next/font` in `app/[locale]/layout.tsx` and exposed as `font-mk-sans`, `font-mk-serif`, `font-mk-mono`.
- **No all-caps with letter-spacing anywhere on the public site.** Labels are sentence case, Geist 500, muted.
- The hero headline is Geist 400 with one Newsreader italic word, marked `*like this*` in the message files so each locale picks its own.
- Primary CTAs are near-black **pills**; on the dark closing card they invert to paper. Secondary actions are underlined text links or ghost pills.
- Page order: hero with the checked chat (sector indicator underneath), partner logos (two rows, one ink), the problem and our answer in two serif sentences, five numbered steps (numeral · title · a short paragraph · a full-width figure), the closing CTA over a blurred black-and-white photograph, footer. No pricing, FAQ or testimonial sections.
- Figures sit on the canvas with no card: line drawings map their paper fills to the canvas (`.dg-bare`). Diagrams that do not scale to a phone ship a mobile drawing (`.dg-desk` / `.dg-mob`); charts are HTML so text stays legible.
- Motion: one ease, `cubic-bezier(0.22, 1, 0.36, 1)`. Entrances rise 14–26px and fade. Anything that advances on its own (hero sectors, step 2 causes) pauses on hover, focus and when off screen; the hero's sector indicator lets a visitor pick one. Under reduced motion nothing moves; the hero still changes sector.
- Container `max-width: 1200px`, gutters `clamp(16px, 4vw, 40px)`. No emoji, no gradients as decoration, no parallax.
- Offers come from `lib/public/evaluation-offers.ts` and appear only in `/llms.txt`, agent markdown and structured data; the landing shows no prices.

Do not import `platform.css` here, and do not carry Newsreader into the platform.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-09-26 | Public site moves to the Paper language: warm canvas, no colour accent (teal removed), Geist + Newsreader + Geist Mono, shorter landing with five illustrated steps. §13 rewritten. |
| 2026-09-20 | Platform redesign. New ElevenLabs-inspired system in `packages/brand/platform.css`; monochrome chrome with semantic-only colour; three-plane shell; expanded primitive kit; dark-ready tokens. Marketing language unchanged, now documented separately in §13. |
