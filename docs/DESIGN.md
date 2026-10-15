# Caudals Design System

Two design languages live in this repository. They are deliberately different and must not be blended.

| | **Platform** | **Marketing** |
| --- | --- | --- |
| Surfaces | `app.caudals.com` — `/workspace/*`, `/ops/*`, `/share`, `/evaluation-entry`, `/auth/*` | `caudals.com` — `/`, `/sectors/*`, `/contact`, `/call`, `/blog`, `/newsletter`, `/legal/*` |
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

**Brand assets** live in `public/`: `caudals-logo-wordmark.png` (mark + "Caudals", 3212×1080; the master) with `caudals-logo-wordmark-108.png` (the same lockup at 321×108, 7 KB, what the sign-in and sign-up screens show: images are served unoptimized, so a page uses a copy sized for its display) and `caudals-logo-icon.png` (the three-bar mark, 1080×1080). `caudals_logo_black.svg` is the mark in vector. Never redraw the mark in CSS and never set `alt` on the lockup inside a link that already has an `aria-label` — that would announce the name twice.

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
- The one oversized number is the report pass rate, `.p-score`: `clamp(40px, 6vw, 56px)` / 600 / `-0.045em`. With no scorable results it reads "No score yet" at title size (`data-empty`), never a giant dash.
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
| `--p-text-tertiary` | `#6f6e68` | Placeholders, group labels, timestamps. Meets WCAG AA (4.6:1 on the chrome, 5.1:1 on the canvas; launch L-24, was `#9a9a94` at 2.5:1): the tier is set apart by size and weight, not a paler grey |
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
| `Status` | `.p-status` | Inline banner, `tone` error·success·warn·info. With an `action`, the action drops to its own line (end-aligned) before the sentence is squeezed below 12rem |
| `Loading` | `.p-status` + spinner | Indeterminate wait, reads as a sentence |
| `Progress` | `.p-progress` | Determinate, needs `label` |
| `Stat` / `StatGrid` | `.p-stat` | `label`, `value`, `meta`, `hero` |
| `DayBars` (charts) | `.p-daybars` | One value per day, one series: ≤ 24px columns from a hairline baseline, only the peak labelled, every value in the tooltip and the table beneath (L-15) |
| `DefinitionList` | `.p-defs` | Term/value rows |
| `Field` / `TextArea` / `SelectField` | `.p-field` | Label always present, `hint` optional |
| `InlineSelect` | `.p-toolbar-label` + `.p-field` | Toolbar-width select |
| `DataTable` / `RowTitle` | `.p-table` | Header may be `{ label, align: "end" }`. `stack` (list tables: Evaluations, Systems, Test sets, Reports): under 640px each row is a block — the title first with the `data-cell="menu"` cell beside it (`data-actions="wide"` when the actions are more than a menu), the other cells wrapping under it named by `data-label` where a bare value is ambiguous, `data-cell="wide"` last on its own line, and a `data-empty` cell (a lone dash) hidden. Evidence tables keep scrolling sideways |
| `EmptyState` | `.p-empty` | Icon in a rounded mark, title, copy, one CTA |
| `SessionRecovery` | — | Sign-in + recovery pair |
| `CodeBlock` (overlays) | `.p-code-block` | Labelled multi-line code with a copy button; lines scroll sideways instead of wrapping |
| `HelpLink` (help) | `.p-help-link` | The contextual "?" beside a step: a 26px round ghost icon (`CircleHelp`, stroke 1.5) with an `aria-label` naming the topic; opens the article in the help panel |
| `HelpBody` (help) | `.p-article` | Help article prose: body size, 1.65 line height, `subtitle` section headings, underlined links, inline `.p-code`. The only long-form reading text in the platform |

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

**Guided flow** (`.p-flow`) — a `640px` centred column, one decision per card. The new-evaluation flow asks for a name, a purpose and how to reach the system (a 2×2 choice grid gated by entitlement); reference material and tests come next, on the evaluation page.

**Evaluation page** — one header (stage badge, system, created date, one primary action, secondary actions in `ActionMenu`) over a four-step tracker (Connect · Prepare tests · Run · Results) and exactly one panel for the current stage. `evaluation-stage.ts` projects the separate backend state dimensions into that one stage; the database keeps them separate.

The evaluation detail page exposes **AI models** in a compact, keyboard-accessible disclosure after the progress steps for platform administrators. Each engine task shows the model, provider and whether it inherits the workspace default, with Change and reset actions using the existing connected-provider picker. The picker explains that queued work retains its models and the target system stays separate. Failed catalog reads show an in-dialog retry. Model identifiers wrap; task rows stack on narrow screens so every action remains visible.

**Inspector** (`.p-inspect` / `.p-inspector`) — from 1024px, the result list stays usable on the left and the evidence sits in a sticky, **nonmodal** `aside` on the right. Below 1024px the same evidence opens in a modal `SidePanel` (full screen under 640px) that returns focus to the row that opened it. Spec §1518.

**Overlays** (`components/evals/overlays.tsx`) — one of each, never nested decisions:

- `Modal` for a decision or a short form. An outcome of the dialog's own action (an error, a re-authentication prompt) renders inside it through `alert`; anything rendered on the page behind the scrim is invisible to everyone.
- `SidePanel` for details of one row (a client, a system, a result, a review). Right-hand panel; full screen on phones.
- `Workspace` for a live tool that needs the whole viewport (the remote browser of the Web App Connector). Modal, inset by the frame gap, full screen on phones; `onEscapeKeyDown` lets an embedded surface keep Escape. Element marks on the live view use `--p-chart-*` series colours and always carry a text label.
- `ActionMenu` for secondary actions. The primary action stays a visible button.
- `notify()` for outcomes that need no decision. Toasts use the `platform` toaster id so the document's global toaster never duplicates them.
- `CopyField` for a value shown once (invitation links, share links, pairing codes, tokens).

**Navigation** — sidebar groups (the workspace group, then Operations for platform roles, then Expert work), a workspace switcher that remembers the last workspace, breadcrumbs in the top bar (their last label also names the browser tab; each crumb is one line ending in an ellipsis, parents capped at 16rem, and under 640px only the parent and the current page show), and `⌘K` for the command palette. On phones the sidebar is a drawer with its own close button. A page inside the app that is not found (`notFound()`) stays in the shell: "Page not found" with one way back to Home (`app/(evaluation)/(authenticated)/not-found.tsx`). Help (how an evaluation works, what each result label means, data handling, contact) is a `SidePanel` opened from the account menu and `⌘K`; the top bar carries no help button. There are no in-page back links: breadcrumbs carry the hierarchy.

**Notification centre** — the topbar bell opens a `SidePanel` with Notifications and Activity tabs. Both show the latest changes first. Quiet filter chips narrow notices to unread or activity to work in progress, attention and completed work. Notices use `.p-notice-*` from the platform kit: semantic icon plus a written outcome, evaluation name, exact timestamp on hover, and an independent mark-as-read action. The badge counts all unread notices; older history loads in place. Refresh and write errors render inside the panel. Closing returns focus to its bell or work-in-progress trigger.

**Session expiry** — any API call answering 401 raises one shell-level alert with *Sign in again* (returning to the current page) and *Recover account*, and hides the page underneath without unmounting it. The invitation page keeps its own recovery because its bearer lives only in the fragment.

**Auth** (`.p-auth`) — one centred `400px` column on the chrome plane. Wordmark, title, description, card, footnote. No split hero, no marketing copy: the person is here to get in.

**Empty states** carry an icon in a 44px rounded mark, a title, one line of copy and at most one action. Never a bare sentence. A quiet text link to the example evaluation may sit in the copy; for viewers, who have no create action, it is the action.

**Report v2** (launch L-17) — the Overview opens with the executive summary, `.p-summary`: a quiet "Executive summary" label, three sentences at subtitle size (each followed by a text-button "Evidence (n)" that filters the results), the sample line above a hairline, then the status badges (`StatusBadge`) each with its one-line explanation, then the next steps (`.p-summary-cta`): Book a readout is the one primary (black) action, Share and Download PDF are secondary, Request expert review is ghost. On phones the steps stack full width. The pass rate under it is a whole percentage (`.p-score`); decimals live in Methodology. "Fix these first" (`.p-fixes`, `.p-fix`) is a numbered hairline list: title, a meta row (severity badge, answer count, the cause labelled "(hypothesis)"), what to do, and its actions (Evidence, and a disabled "Re-run these questions" with a visible note until re-runs of a subset exist); CSV and Markdown exports sit in the section heading as ghost buttons. The shared page (`/share`) adds `.p-share-intro` (a surface-2 panel: what the report is, private and not a certification) above the report and `.p-share-cta` (a bordered card: "Test your own assistant free" with one primary action) below it.

**Workspace Home** (launch L-22) — `.p-home`, a grid of cards (`.p-home-card`: a 28px icon mark, a subtitle heading, an optional count badge and a quiet link on the right). "Needs your action" and "Latest score per system" span the full width; Next run, Plan and Shortcuts share a row (one column under 900px, two to 1279px, three from 1280px). Rows are `.p-home-item` hairline lists whose title link stretches over the row; a score is `.p-home-score` (the trend's runs, a delta badge in pass/fail/neutral tone, the whole-percent value at subtitle size). Shortcuts are `.p-home-shortcut` tiles on surface-2. The plan card leaves `.p-home-balance` for L-15 and never shows a number of its own.

**Systems health** (launch L-22) — health is a `StatusBadge` (`connected`, `needs_attention`, `checking` with a live dot, `not_checked`), never colour alone; "Fix" is a ghost button with a wrench, "Check now" a secondary button. `.p-health` is the status/last-check block in the system panel and on the Connect step; the empty state adds `.p-connect-kinds` (three bordered cards: website chat, API, uploaded answers, each with an example).

**Test-set review** (launch L-22) — the spot check reuses `.p-review`: checked questions carry an inset pass rule (`[data-checked]`) and a "Checked" badge; per-question actions (`.p-review-case-actions`) sit under the answer; the full review adds `.p-review-bulk` (select-all checkbox with the selection count, then the bulk actions) and per-question checkboxes (`.p-review-select`). `.p-review-label` is secondary grey (tertiary failed AA contrast at 11px). Shortcuts list in a small `Modal` (`.p-shortcuts`, `kbd.p-kbd`). The sidebar foot has a visible Help entry (`button.p-nav-item`) above Settings.

**Example evaluation** (`/workspace/example`) — the standard report page with an "Example" pill (`Badge` tone `strong`) first in the heading meta, an info `Status` with the synthetic-data line above the report on every tab, and the three-run trend and comparison at the top of Overview (`.p-report-intro`). Page headings keep at least 10rem for the title; actions that leave less drop below it.

**Sector packs and monthly questions** (launch L-25) — the ops library's **Sector packs** tab and `/review/sector-packs` use the standard kit: a pack table (version and status badge, approved/total, oldest source with a "Check source" warn badge past 180 days), then a version page whose warn `Status` says the questions are drafts pending expert review (an info `Status` on published versions), a `Progress` of approved questions, a toolbar (search, topic and review selects) and the question table (source line, rights badge, review badge never colour alone, anonymous results). A question opens in a wide `SidePanel` (excerpt as `.p-quote`, source link, rights basis, author and reviewer); experts review in its footer section `.p-sector-review` (Approve primary; Request changes and Reject need a note). In Prepare and on a test set, `.p-sector-card` is one quiet card (icon, subtitle heading, one sentence, one primary action and a badge for the sector); the monthly panel `.p-monthly` lists readings as plain bullets and proposals as `.p-proposal` rows (checkbox with question and expected answer, a New/Changed page badge, the page URL wrapping anywhere, the quote) with Approve selected / Reject selected.

**Readout mode** (launch L-35) — the one full-window surface: `.p-readout` is portalled over the shell on the action colour (`--p-text`) with the slide centred at 16:9 and a quiet control bar below it (ghost buttons in `--p-text-inverse`: Exit, previous / "n / N" / next, Notes and transcripts or Next step, Presenter view, full screen, Export PDF). Slides are a document, not platform UI: one HTML template shared with the 16:9 PDF (`READOUT_CSS`, `.rd-*`), sized in slide units so the projector, the laptop and the PDF show the same layout; body text is 24 units (36 px at 1920 × 1080), labels 18, the verdict score 150. Colour on a slide is still a verdict (result and severity chips, failure bars). The presenter view sits on the chrome plane: current slide large, next slide and the notes beside it, the timer with its §7.5 segment in the header. Below 700 px a slide becomes a scrolling card at readable sizes. Slide changes fade and shift 8 px over `--p-dur-modal`; reduced motion keeps the fade only.

**Ask your report** (launch L-36) — a secondary "Ask this report" action in the report heading opens a wide `SidePanel` (full screen on phones). `.p-qa` stacks: `.p-qa-intro` (surface-2 panel: title, one line on what is in and out of scope, suggestion `Chip`s) before the first question; the thread `.p-qa-thread` of `.p-qa-item`s (hairline separated), each with the question as a surface-2 bubble (`.p-qa-question`, a ghost trash icon for owners) and the answer (`.p-qa-answer`: plain sentences, each followed by `.p-cites`, small pill buttons `.p-cite` with the T or F reference, tabular figures, `aria-label` naming the result or finding); fixed refusals, "can't answer" and failures read as secondary text (`.p-qa-fixed`) with quiet links (`.p-qa-links`); the form `.p-qa-form` with a labelled `TextArea`, its character count, and a foot (`.p-qa-form-foot`) holding the cost and limits (`.p-qa-cost`, micro, secondary) and the one primary "Ask" (full width under 600 px). No colour beyond the kit: citations are monochrome; waiting uses `Loading`.

**Expert review** (launch L-26) — the request is a ghost action in the next steps; once sent it becomes `.eval-review-request`, a quiet icon-and-text status line in `--p-text-secondary`. The form is a standard `Modal` with radio scopes (`.eval-review-scopes`). The reviewed label is one more row of the summary status list ("Expert review"), tone pass, worded "Reviewed by N experts on <date>, scope …". The workbench heading carries the due badge (fail when overdue, warn within a day) and `.eval-save-state` (micro text, `--p-fail` on error); `.eval-shortcuts` lists the keys with `.p-kbd`. Ops forms use `.p-form-grid` and `Check` lists; the redacted preview reuses `.eval-evidence`.

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
- Reduced motion means *fewer and gentler*, not none: opacity and colour survive because they carry meaning; movement and scale do not. Spinners (`.p-spinner`, the jobs pill, a running job) pulse in opacity instead of turning (launch L-24).

**The sidebar collapse** is the one place two easings meet, and the split is deliberate. The rail *morphs* on screen, so `grid-template-columns` takes `--p-ease-in-out` over `--p-dur-modal`. The labels inside it are *exiting*, so they take `--p-ease-out` and go faster — `90ms` out — so text is gone before the rail finishes narrowing and never clips mid-glyph.

**A hidden control is still the hit target.** The radio inside a `.p-choice` card is `opacity: 0` but stretched over the whole card with `pointer-events` intact, so a click lands on the real control. Never `pointer-events: none` on an input you have visually hidden: it hands the interaction to a label, shrinks the target, and breaks assistive tech and automation alike.

**Menus are modal (the Radix default), and selecting an item closes them.** A modal menu `aria-hidden`s the shell behind it; if the menu stayed open after a selection, any status the shell then reported — a failed sign-out, say — would be invisible to assistive technology. Closing on select lifts the `aria-hidden` and the message lands.

## 11. Accessibility

- Focus is a `2px` solid `--p-focus` ring at `2px` offset. Visible on every interactive element. Never removed without an equivalent replacement.
- Minimum target `32px`; `36px` for primary actions.
- Every icon-only control has an `aria-label`. Every decorative icon has `aria-hidden="true"`.
- Tables use `<caption class="sr-only">` and `<th scope>`.
- Live regions: `role="status"` for progress, `role="alert"` for errors, `aria-live="polite"` on run progress.
- `Modal` gives focus back to whatever had it when the dialog opened (Radix only does that for its own trigger); side panels take a `returnFocus` (launch L-24).
- Every text colour meets WCAG 2.2 AA (4.5:1, 3:1 for large text) on the surface it sits on. `e2e/evals/a11y.contract.ts` (UI harness) and `e2e/a11y-public.spec.ts` (served pages) run axe with the WCAG 2.0–2.2 A/AA and best-practice rules and fail on any serious or critical issue on the core screens (launch L-24).
- The skip link (`.p-skip`) is first in the shell and lands on `#p-main`.
- Colour never carries meaning alone (§1.6).

## 12. Interop and migration

The platform reuses the repo's shared shadcn components rather than forking them. Inside `.p-root`, `[data-slot="button"]`, `[data-slot="input"]` and the dialog/sheet chrome are restyled to this language, so a screen that has not yet migrated to the `p-*` primitives still looks right. `components/ui/button.tsx` emits `data-variant`/`data-size` purely so this remap can target it.

Two selector techniques appear throughout and are deliberate:

- **Doubled class** (`.p-menu.p-menu`) raises specificity to (0,2,0) so platform rules beat a Tailwind utility at (0,1,0) **on specificity rather than on stylesheet order**, which Next does not guarantee.
- **Tokens on `:root`, rules under `.p-root`.** Dropdowns, sheets and dialogs render through a portal at the end of `<body>`, outside `.p-root`. Custom properties declared but never referenced elsewhere cost nothing and inherit everywhere, which is exactly what portalled surfaces need.

**No compatibility layer.** Every evaluation screen composes the `p-*` primitives. `app/(evaluation)/evaluation.css` keeps only the expert workbench grid and its save-conflict alert; a rule belongs there only when it is about one evaluation screen.

**The legacy `/admin` dashboard is removed.** It and all its subroutes return 404. Platform screens use the evaluation shell and primitives; do not restore the legacy sidebar, command palette or module UI.

---

# Part II — Marketing

## 13. The public site

`caudals.com` uses the **Paper** language chosen from the 2026-09 redesign mockup (`c-design/landing-redesign`, variant 1 and the hero study): a calm research-report page, monochrome by rule.

- Tokens: `packages/brand/tokens.css` (`--ds-*`), consumed via `app/globals.css`. The landing adds its own scoped palette in `components/landing/landing.css` (`.lp`), with the same values.
- Warm paper canvas `#fafaf8`, white paper `#ffffff` for sheets and bubbles, ink `#141413`, secondary ink `#3b3a36`, muted `#6b6a63` (5.2:1 on the canvas), hairlines `#dcdad3` / `#e9e7e1`.
- **No colour accent.** Teal and emerald are gone from every public surface; the `--ds-accent*` names remain for existing consumers and resolve to ink. A verdict is a solid ink cross or an outlined ink tick, always next to a word.
- Type: Geist for everything, titles included (400, tight tracking). Newsreader only for the hero's italic word, the problem statement and document excerpts. Geist Mono only for small figures inside diagrams. Loaded with `next/font` in `app/[locale]/layout.tsx` and exposed as `font-mk-sans`, `font-mk-serif`, `font-mk-mono`. Geist is preloaded; Newsreader and Geist Mono load after the first paint and swap in from their metric-matched fallbacks (launch L-24d, FRONTEND.md).
- **No all-caps with letter-spacing anywhere on the public site.** Labels are sentence case, Geist 500, muted.
- The hero headline is Geist 400 with one Newsreader italic word, marked `*like this*` in the message files so each locale picks its own.
- Primary CTAs are near-black **pills**; on the dark closing card they invert to paper. Secondary actions are underlined text links or ghost pills. The free-test CTA (launch L-04, `components/landing/demo-cta.tsx`) is one taller pill that carries its small print on a second line ("8 questions, about 3 minutes", 12.5px at 70 % opacity); on the closing card the manual diagnostic follows as one underlined line. The header pill reads "Try it free", with a quiet "Sign in" text link before it; on a phone a compact pill sits beside the menu button.
- Page order: hero with the checked chat (sector indicator underneath), partner logos (two rows, one ink), the problem and our answer in two serif sentences, five numbered steps (numeral · title · a short paragraph · a full-width figure; step 1 names the free test), a short centred FAQ (`<details>`, five questions; the price answer names no numbers), the closing CTA over a blurred black-and-white photograph, footer. No pricing or testimonial sections.
- The closing card, with the free test public: the two-line test pill, the call as a ghost pill, then one underlined line to a pilot request ("Need answers reviewed by experts in your sector? Request a pilot"; a sector page names its own reviewers). Sector heroes put the test pill first and "Or request a pilot reviewed by …" as the quiet link under it (launch L-30).
- Footer: brand and contact, Explore, Sectors, Trust (Security, DPA, Sub-processors) and Legal (Terms, Privacy, Cookies, Legal notice) as five equal columns from 1024px, two below; every legal page appears once.
- `/contact` keeps the quiet underline form, cut to five fields; the free test line ("Prefer to try it yourself? Run the free test") sits in ink above the muted call link. `/call` adds a three-line agenda as hairline rows with muted numerals in a 28rem column above the scheduler, and a confirmation sheet (white, hairline border, 14px radius) that replaces the scheduler after a booking. The 404 puts the test pill first and the home page and sectors as underlined lines.
- Figures sit on the canvas with no card: line drawings map their paper fills to the canvas (`.dg-bare`). Diagrams that do not scale to a phone ship a mobile drawing (`.dg-desk` / `.dg-mob`); charts are HTML so text stays legible.
- Motion: one ease, `cubic-bezier(0.22, 1, 0.36, 1)`. Entrances rise 14–26px and fade, except the hero headline and standfirst (landing, sector pages, demo): they are the largest paint, so they rise without fading (`.lp-lift`) and show at full opacity from the first frame (launch L-24, mobile LCP). Anything that advances on its own (hero sectors, step 2 causes) pauses on hover, focus and when off screen; the hero's sector indicator lets a visitor pick one. Under reduced motion nothing moves; the hero still changes sector, and its new conversation fades in bubble by bubble (opacity only). With motion allowed, each bubble rises 8px out of a 3px blur, question then answer.
- Container `max-width: 1200px`, gutters `clamp(16px, 4vw, 40px)`. No emoji, no gradients as decoration, no parallax.
- Offers come from `lib/public/evaluation-offers.ts` and appear only in `/llms.txt`, agent markdown and structured data; the landing shows no prices.
- Sector pages share the landing's frame (`components/landing/landing-shell.tsx`) and order: breadcrumb, hero (audience label, headline with one serif word, the sector's own checked conversation), the stakes in two serif sentences, three numbered steps (what we test as two hairline lists · failure modes with the sector's examples · the sector's experts and datasets), a hairline FAQ (`<details>`, a plus that turns into a minus), cards to the other sectors, the closing CTA. The hub lists every sector as a hairline row. Share images use the same canvas, ink and type.

- The demo (`/demo`, `components/demo/demo.css`, scoped `.dm` inside the landing's `.lp` palette) uses the same language: a 760px column, one rounded input bar with the pill CTA, hairline step grid (mono numerals, an ink rule that fills as each step completes, a blinking block caret on the active one), a hairline ledger, the score as one oversized Geist numeral with a Newsreader sentence, and one white sheet for the account offer plus a pinned pill bar that leads to it. With the front door on, the sheet's actions run in one column in a fixed order: the account form (work email, optional company, the pill), a hairline, "Book a readout" as a full-width ghost pill, then "Send to a colleague" as a centred text link that opens a line input, a muted note and the consent checkbox. Service notices are one white sheet with a hairline border; the queue is a hairline-topped block with the place in line in the sans, the ETA as one Newsreader sentence, and the email form as a line input, an ink-accented checkbox and the pill. New entrances fade only, and nothing moves under reduced motion. Verdict marks are ink only: outlined tick (correct), solid cross (wrong), half disc (partly right), dash (no answer), dotted ring (not scored), always with a word.

- Email (`lib/email/layout.tsx`, launch L-07) uses the same Paper language in email-safe table markup: the warm canvas, one white sheet (560px, 14px radius, hairline border), a "Caudals" wordmark in text, a 22px semibold heading, body in secondary ink, numbered steps and receipt rows as hairline rows, one near-black pill for the single main action (with the raw link under it for sign-in links), and the reason for the email, the settings or unsubscribe link and "Caudals · caudals.com" in muted 12px type under the sheet. No images, no colour, no web fonts (system stack), light only.

- Legal pages (`components/legal/legal-page.tsx`) are reading documents: a quiet list of the legal documents beside one column held to about 70 characters a line (17px Geist, 1.7 line height, secondary ink), a sentence-case "Legal" label, the title in Geist 400, the standfirst, then "Last updated" and the version in muted text. Sections are numbered, anchored and separated by space, not rules; long documents add a two-column contents list under a hairline. Tables (sub-processors) are hairline rows on wide screens and one block per row on a phone. Secondary actions such as the DPA template downloads are ghost pills.

- The methodology page (`/methodology`, `components/methodology/methodology-page.tsx`) follows the legal reading layout without the document list: one column of about 70 characters, a sentence-case "Methodology" label, a Geist 400 title with one Newsreader italic word, the standfirst and "Last updated", a two-column contents list under a hairline, numbered anchored sections. The outcome labels are a hairline table with the demo's ink verdict marks beside each word (one block per label on a phone); the sample-size table keeps tabular figures and stays a table at 390 px. It closes with a white sheet: the near-black free-test pill and a ghost pill to book a call.

- The sample report (`/sample-report`, `components/sample-report/sample-report.css`, scoped `.sr` with the `.lp` values) is a reading page in a 920px column: an ink-bordered "Example" label with the synthetic-data line at the top and the bottom, the kicker, a Geist 400 title with one Newsreader italic word, the standfirst and a pill to the PDF; then hairline sections for the score (one oversized Geist numeral, a Newsreader sentence), the three-run trend (ink bars on a hairline track), the comparison, the executive summary, numbered findings and improvements, every result as a `<details>` row (verdict mark and word, the answer on a white sheet, the document excerpt in Newsreader), the method, and a dark closing card with inverted pills. Outcome bars are ink, grey and hatched ink, always with a legend that carries the words and counts.

- The vendor's fix list (`/share/fixes`, launch P-54, `components/evals/vendor-fix-list.css`, scoped `.vf` with the `.sr` values) is the one Paper page served by the app: no navigation, a hairline bar with the wordmark, a muted "Fix list · shared privately" and the two language names as quiet pills; a 920px column with the kicker, a Geist 400 title ("What to fix in <system>"), the standfirst, a hairline facts row (tested on, fixes, answers, grades, link expiry), the hypotheses and scope notes in muted 14px with the methodology link, and Markdown/CSV as ghost pills. Each fix is a numbered hairline row: title, a severity tag (ink border for critical and high) with the answer and critical counts, the cause line ("Likely cause (hypothesis): …"), the source in muted text, "What to do" on a white sheet, then its answers as `<details>` rows numbered `1.1`, `1.2` (verdict mark and word, severity) that open on the answer sheet, the expected answer, why it was marked, missing or contradicted key facts, contradictions and the Newsreader source quote. It closes with a dark card (inverted pills): "Build assistants for your clients?", the free test and the partner programme enquiry. The owner's preview renders the same markup inside the platform side panel (`.vf-preview`).
- Opt-in public results pages (`/results/<slug>`, `components/public/results-page.tsx`, launch L-31) follow the methodology reading layout: a sentence-case "Public test results" label, the owner's name as a Geist 400 title, a standfirst that says who chose to publish, the test and publication dates in muted text, then hairline-separated sections. The result is one oversized Geist percentage with a Newsreader sentence ("33 of 46 scored answers matched the sources."), the interval in prose and the outcome counts as a hairline table with the ink verdict marks; then what was tested, the sample, the review, the methodology link and the limits, which are always on the page. No badge, seal, logo, colour or score artwork: nothing that could be cut out and shown as a certificate. A white closing sheet offers the free test and a call.
- The anonymous sector index (`/sector-index/<quarter>`, `components/public/sector-index-page.tsx`) uses the same frame in a slightly wider column: a hairline table (sector, systems, median, middle half, answers scored, pooled outcome shares) with tabular figures, one block per sector below 768 px, then the published method and the limits. Only aggregates: no names, no best or worst system, no ranking order beyond cohort size.

Do not import `platform.css` here, and do not carry Newsreader into the platform.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-10-15 | UI review R1: one-line breadcrumbs (parent and page on phones), the unread count on the bell's shoulder, `DataTable stack` for list tables on phones, `Status` actions wrap, the drawer's close button, the in-shell "Page not found", draft badges neutral. |
| 2026-10-15 | Billing gaps (G2): the run pipeline's stages not reached yet use `--p-text-secondary` like finished ones (tertiary failed AA on the paused run's panel and is 3.7:1 under the authored dark theme); the current stage stands out by full-strength 500-weight text, its count and its bar. The billing contracts no longer exclude `.p-pipeline` from axe. Ops console: a *Provider-price check* panel under the price book and a *Tax reviews* view, both from the kit (badge, table, definition list in a `Modal`, radio `p-check` choices with descriptions). Limits and alerts: the low-balance threshold is a select (default or own) plus a credits field, like the caps above it. |
| 2026-10-14 | "Send to my vendor" (P-54): the Paper fix-list page for vendors (`.vf`) in §13, and the owner's "Send to my vendor" button and dialog from the kit. |
| 2026-10-14 | Partner dashboard (L-28): stats strip, tables and dialogs from the kit; `.p-partner-links` (ghost copy buttons per referral link), `.p-partner-logo` (bordered logo preview), `.p-partner-statement`, `.p-partner-subhead`. White-label PDF cover: a hairline row under the Caudals brand bar, "Delivered by" + logo (≤ 28 px high) + partner name, and "Evaluation and methodology by Caudals"; the Caudals brand stays first. |
| 2026-10-14 | Opt-in public results (L-31): the Paper results page and anonymous index in §13 (no badge or seal artwork), and `.eval-consent-text` for the owner's consent wording in the app. |
| 2026-10-14 | Accessibility and performance budgets (L-24): `--p-text-tertiary` darkened to meet AA, `Modal` returns focus, spinners pulse under reduced motion, the Paper hero text rises without fading (`.lp-lift`) and the cookie notice enters with CSS. |
| 2026-10-14 | Expert review (L-26): `.eval-review-request`, `.eval-review-scopes`, `.eval-save-state`, `.eval-shortcuts`; the "Expert review" summary status row. |
| 2026-10-13 | Sector packs and monthly new questions (L-25): the Sector packs library tab and expert screen (pack table, draft banner, review progress, question panel with excerpt, rights and review), `.p-sector-card` in Prepare and on test sets, and the monthly proposals panel (`.p-monthly`, `.p-proposal`). |
| 2026-10-13 | Better document intake (L-34): the drop zone answers a drag (`data-dragging`) and lists every file of a batch with its own badge, progress and retry (`.p-intake-*`); the scanned-PDF ask under its source row (`.p-files-notice`); the help-centre page list with checkboxes and the estimate (`.p-import-*`); "What we understood about your assistant" (`.p-ctx-*`: one row per field, low confidence flagged by a "Check this" badge and a warn edge, sources one click away, inline edits marked "Corrected"). |
| 2026-10-13 | Billing and usage (L-15): `DayBars` (one series in `--p-chart-1`, ≤ 24px columns, 2px gaps, only the peak labelled, a table under it), the sidebar plan-and-balance pill (a nav row), the low-balance banner, the run estimate (`.p-estimate`: facts as a definition list, the cost as one subtitle-size sentence), model rates; figures under billing stats use `--p-text-secondary` for contrast. |
| 2026-10-13 | Help centre, API reference and methodology (L-20): `HelpLink`, `HelpBody` prose (`.p-article`), the help list (`.p-help-item`), `CodeBlock` and the API reference blocks (`.p-api-*`); the Paper methodology page in §13. |
| 2026-10-13 | Public site refresh (L-30): step 1 and FAQ name the free test, the closing card's pilot line, sector heroes' pilot link, the footer's Trust column, the five-field contact form, the call agenda and confirmation, the 404's test pill; the Settings DPA row (platform kit). |
| 2026-10-12 | Report v2 and share page (L-17): `.p-summary` with next steps, `.p-fixes`, `.p-share-intro` and `.p-share-cta`; whole-percent headline. |
| 2026-10-12 | Example evaluation and public sample report (L-33): `.p-report-intro`, wrapping compact lists (`data-wrap`), a 10rem minimum for page-heading titles, and the Paper sample report page. |
| 2026-10-12 | Branded EN/ES emails (L-07): the Paper email frame in §13. |
| 2026-10-12 | The free test becomes the front door (L-04): the two-line free-test pill, the header's "Try it free" and "Sign in", and the demo account sheet's action order. |
| 2026-10-12 | Legal pages get a reading layout (document list, version date, numbered sections, contents, responsive tables) for the launch trust pages (L-01). |
| 2026-10-05 | The public demo joins the Paper language; §13 documents its parts and verdict marks. |
| 2026-09-27 | Sector pages and the sectors hub join the public site in the Paper language; §13 documents their order. |
| 2026-09-26 | Public site moves to the Paper language: warm canvas, no colour accent (teal removed), Geist + Newsreader + Geist Mono, shorter landing with five illustrated steps. §13 rewritten. |
| 2026-09-20 | Platform redesign. New ElevenLabs-inspired system in `packages/brand/platform.css`; monochrome chrome with semantic-only colour; three-plane shell; expanded primitive kit; dark-ready tokens. Marketing language unchanged, now documented separately in §13. |
