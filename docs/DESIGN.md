# Caudals Design System

Single source of truth for the visual + interaction language across every surface: public landing, contact, blog, internal admin, evaluation dashboards and reports, and the `/proof` demo. Light-mode only. Anything not specified here defers to `app/globals.css` (tokens) and `c-design/Caudals Design System/` (recipes, previews, UI kits).

## Agent Instructions
When building or refactoring any UI:
1. Match the **live landing page** before introducing new aesthetics. Re-use existing primitives in `components/ui/*` and `components/landing/*` before inventing.
2. Use the **tokenized values** below — never hand-roll colors, radii, or shadows.
3. Editorial calm: off-white canvas, white cards, **near-black** (`#111827`) type, three-tier gray, single **emerald/teal** accent, one **serif italic** word as the signature display move.
4. **Black CTAs, emerald/teal accents.** Primary actions are never teal. Teal is reserved for status, eyebrows, focus, the italic display word, and soft pills.
5. **No emoji, no purple-blue gradients, no harsh shadows, no inner shadows, no parallax beyond the hero Spline scene.**
6. **No webfonts.** Native SF / system stack; serif via `"New York", "Iowa", Georgia, serif` for the italic accent only.
7. Dense admin and evaluation screens must stay readable under time pressure — favor hairline dividers (`gap-px bg-gray-100`) over heavy borders.

## Scope
- **In scope:** landing, contact, blog, `/admin/*`, planned evaluation surfaces (operator authoring and grading, restricted expert workspace, customer dashboard, `/proof`), evaluation report PDFs, responsive (mobile · tablet · desktop), all server-rendered pages, PWA shells.
- **Out of scope:** dark mode (deferred), schema/domain contract changes, legacy surfaces (`/buyer`, `/supplier`) — fix defects only, no redesign.

## Experience Principles
1. **Editorial calm.** Evidence should feel precise, quiet, serious. Headings are `font-normal` (400), not bold — boldness is reserved for labels.
2. **Typography is the hero.** One serif italic word inside an otherwise neutral display headline (`font-serif italic text-teal-700/90`) is the signature.
3. **Content breathes.** Public sections use `py-24 sm:py-32`, container `max-w-5xl`, side gutters `px-6 sm:px-8 lg:px-12`.
4. **Trust is operational.** Source citation, suite version, run, verdict, grader and reviewer must be visible on every case and result — surface them as chips/dots, not buried fields.
5. **Motion is deliberate.** One `cubic-bezier(0.22, 1, 0.36, 1)` ease everywhere. Entrance reveals are `opacity 0→1, y 20→0, 500–800ms`, staggered `0.05–0.1s`. No bounces, no springs.

## Foundation Tokens
Single source: `app/globals.css` (production) mirrored in `c-design/Caudals Design System/colors_and_type.css`. Use these names, not raw hex.

```css
/* Surfaces */
--ds-canvas:        #f9fafb;  /* page background */
--ds-sidebar-bg:    #f9fafb;
--ds-surface:       #ffffff;  /* cards, popovers, dialogs */
--ds-surface-muted: #f9fafb;
--ds-border-soft:   #f3f4f6;  /* hairlines, table dividers */
--ds-border-strong: #e5e7eb;  /* inputs, edges that must be seen */

/* Text — three-tier gray; never pure black for body */
--ds-text-primary:   #111827; /* gray-900 */
--ds-text-secondary: #6b7280; /* gray-500 */
--ds-text-tertiary:  #9ca3af; /* gray-400 */

/* Brand accent (emerald/teal — interchangeable names) */
--ds-accent:        #059669;  /* emerald-600 — primary state color */
--ds-accent-hover:  #047857;  /* emerald-700 */
--ds-accent-soft:   #ecfdf5;  /* emerald-50 — soft fills */
--ds-accent-soft-2: #d1fae5;  /* emerald-100 */
--ds-accent-text:   #047857;  /* text on soft */
/* Display accent (serif-italic word only, ~90% opacity) */
--ds-accent-teal:   #0f766e;  /* teal-700 */

/* Semantic */
--ds-danger:  #dc2626;  --ds-danger-soft:  #fef2f2;
--ds-warning: #d97706;  --ds-warning-soft: #fffbeb;
--ds-info:    #2563eb;  --ds-info-soft:    #eff6ff;

/* CTA — primary action is near-black, never teal */
--ds-cta-bg:       #111827;
--ds-cta-bg-hover: #1f2937;
--ds-cta-text:     #ffffff;

/* Radii */
--ds-radius-xs:   6px;
--ds-radius-sm:   8px;
--ds-radius-md:  10px;  /* default for buttons, inputs */
--ds-radius-lg:  12px;
--ds-radius-xl:  16px;  /* cards, panels */
--ds-radius-pill: 999px; /* hero waitlist, status dots, live pills */

/* Shadows — two utility tiers + hero */
--shadow-xs:        0 1px 2px 0 rgba(0,0,0,0.05);   /* inputs, buttons */
--ds-shadow-surface:0 1px 2px rgba(0,0,0,0.02);     /* settled cards */
--ds-shadow-overlay:0 10px 30px rgba(0,0,0,0.08);   /* popovers, dropdowns, hover-lift */
--shadow-soft-md:   0 18px 30px -25px rgba(15,23,42,0.18);
--shadow-soft-lg:   0 22px 45px -25px rgba(15,23,42,0.25);
--shadow-hero:      0 48px 120px -56px rgba(15,23,42,0.62); /* hero preview only */
/* No inner shadows. No glow. */
```

## Typography
- **Family:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, …`. No webfont loaded — Inter substitutes silently on non-Apple devices.
- **Serif accent:** `"New York", "Iowa", Georgia, serif` — used **only** italic, **only** for one or two words inside a display headline, **only** in `text-teal-700/90`.
- **Mono:** `ui-monospace, SFMono-Regular, Menlo, …` — citation and case-ID chips, console mockups.
- **Display weight is 400** (`font-normal`) with tight tracking (`-0.02em` to `-0.03em`). Bold (700) is reserved for: eyebrows, labels, button copy, table column headers, status pills, card H3.
- **Hierarchy:**
  - Hero: `text-5xl sm:text-7xl lg:text-8xl` (48 → 72 → 96), `font-normal tracking-tight text-black`.
  - Section H2: `text-4xl sm:text-5xl font-normal tracking-tight`.
  - Card H3: `text-lg font-bold text-black`.
  - Body: `text-base leading-relaxed text-gray-500` (long form) / `text-sm` (cards) / `text-xs` (meta).
  - Eyebrow: `text-[13px] font-bold text-teal-600 mb-4`.
  - Overline / micro-label: `text-[10px]–text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400` (column headers, "LIVE", "AVAILABLE", "EVALUATION CONSOLE").
- **Tabular nums** on every number in a list, table, stat tile, or financial column.

## Layout System
- **Public canvas:** `bg-white`. Alternating very-light bands `bg-gray-50/50` may be used between sections, but the current landing is mostly pure white.
- **Section container:** `mx-auto max-w-5xl px-6 sm:px-8 lg:px-12` (marketing copy), `max-w-7xl` (header, wide tables and grids), `max-w-4xl` (FAQ-like long-form).
- **Section rhythm:** `py-24 sm:py-32` for content; `py-32 sm:py-48` for the closing CTA.
- **Header:** `h-16` sticky, transparent at top, **translucent on scroll** (`bg-white/40 backdrop-blur-[22px]`) with a subtle bottom border.
- **Hero:** Spline 3D scene full-bleed at `opacity-85`, white→transparent fade (`bg-gradient-to-t from-white to-transparent`) handing off to the next section. Centered copy, eyebrow chip with pulsing teal dot, huge display headline with one italic serif word, waitlist input/button as a single pill, glass-card "console" preview below.
- **Admin canvas:** `bg-canvas` (`#f9fafb`) with white panels, hairline dividers, compact trust/status chips. Sidebar 256px (`w-64`).
- **Grids of cards** that should read as "panels welded together": use the hairline trick — `gap-px bg-gray-100` with `bg-white` children — instead of explicit borders.

## Core Component Contracts
- **Buttons** (`components/ui/button.tsx`, defaults `rounded-md`):
  - Primary: `bg-black text-white hover:bg-black/90 font-bold`, optional `hover:scale-[1.02]`.
  - Outline: `border-gray-200 text-black hover:bg-gray-50 font-bold`.
  - Ghost: nav links only — `text-gray-500 hover:text-black transition-colors`.
  - Teal is **not** a button variant; it's status.
  - Sizes: `h-9` default, `h-12` lg, `h-14` for the closing CTA, `h-10`–`h-12` rounded-full for hero waitlist.
- **Inputs:** `h-9–h-12`, `border-gray-200 bg-white rounded-md`. Public contact form may use bottom-border + transparent bg. Hero waitlist is `rounded-full bg-white/60 backdrop-blur-sm`. Focus ring: `focus-visible:ring-[3px] focus-visible:ring-ring/50` (teal).
- **Badges/chips:**
  - "LIVE" / status pill: `text-[10px] font-bold uppercase tracking-[0.12em]` in teal-700 on teal-50, with a 1.5×1.5 teal dot, optional `animate-pulse`.
  - Available/in-progress/blocked: 1.5×1.5 dot + 11px bold text in matching semantic color (teal / amber / red).
- **Cards/panels:** `bg-white border border-gray-100/200 rounded-xl shadow-sm` or `shadow-none`. Hover: `border-gray-300 shadow-md` + optional `hover-lift` (translate-y -4px + shadow-overlay).
- **Glass card** (hero preview only): `bg-white/72 backdrop-blur-2xl border-gray-200/60 rounded-2xl shadow-hero`. Recipe `.glass-card` in tokens.
- **Tables:** white surface, **horizontal hairlines only** (`divide-gray-100`), header row in gray-50/40, column headers in overline style (`text-[11px] font-medium text-gray-500`). Tabular nums on numeric columns.
- **Feature/capability tile:** 48×48 `rounded-md bg-gray-50 text-gray-400`, hover flips to `bg-teal-50 text-teal-600`, 24×24 lucide icon.
- **Step badge:** 40×40 `rounded-md bg-teal-50 text-teal-600`, 20×20 icon, `group-hover:scale-110`.
- **Score figure:** display weight 400 with tabular nums, always shown with its basis — an interval (`61% ± 8`) or a count (`4 of 26`). Never a bare percentage for must-pass results.
- **Verdict chip:** pass / partial / fail as a 1.5×1.5 dot plus 11px bold label in teal / amber / red. Must-pass failures use the danger-soft fill and sort first.
- **Case row:** question, response excerpt, verdict, failure cause, source citation (mono chip), grader and reviewer, on horizontal hairlines.
- **Overlays** (dropdown, popover, dialog, sheet): forced opaque white via `globals.css` `[data-slot="*-content"]` rule. The pattern: blur = floating UI; opaque = settled UI.

## Evaluation Reports (PDF)
- Same tokens on a white A4 page: near-black type, three-tier gray, one emerald accent, serif italic only for a single cover word.
- Structure through kicker labels, hairline tables and generous spacing — no heavy borders or fills.
- Callouts carry meaning by color: emerald for recommended actions, amber for cautions, red only for must-pass incidents.
- The customer's name leads the cover; Caudals appears once, small, on the last page.
- Render HTML to PDF with Playwright Chromium (`page.pdf`, A4, `printBackground: true`) with a quiet footer carrying page numbers.

## Iconography
- **Library:** `lucide-react` only (`iconLibrary: "lucide"` in `components.json`). Stroke `2`, default size `h-4 w-4` on buttons. Icons take `currentColor`; never filled, never colorized.
- **Sidebar nav:** `h-3.5 w-3.5`. **Inline metric/row icons:** `h-4 w-4 text-slate-500`. **Footer social:** 20×20 `currentColor`.
- **No emoji. No unicode-as-icon** (`→`, `★`, `•` → use `ArrowRight`, `Star`, `Circle`).

## Motion
- **Ease:** `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-soft-spring`) for everything.
- **Durations:** `150ms` interactive, `300ms` component state, `500–800ms` entrance only.
- **Entrance:** Framer Motion — `initial={{opacity:0, y:20}} whileInView={{opacity:1, y:0}} transition={{duration:0.5, delay:i*0.05}}`. `viewport={{once:true, margin:"-60px"}}` for scroll-triggered sections.
- **Hover:** links `gray-500 → black`; cards lift 4px + shadow upgrade; primary CTA `scale-[1.02]`; feature tile flips gray → teal.
- **Pulse:** `animate-pulse` on the small teal dot in the hero eyebrow chip and any "LIVE" pill.

## Focus
3px ring at `--ds-accent` (`#059669`) with `ring-offset-2`. Always visible. Inputs: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`.

## Content & Copy Hooks (visual contract)
Design choices assume Caudals voice: confident, plain, business-class, sentence case for buttons/labels/nav/headings, ALL CAPS only inside `letter-spacing: 0.12em` micro-labels, no exclamation marks, no hype words. Hero highlight is always **one serif italic teal word**. Trust signals are **concrete numbers** (`61% ± 8`, `4 of 26 critical questions`, `48 h`, `2 weeks`).

Strings ship through `t()` for `en` + `es`. Never hardcode English in app/marketing/auth/PWA.

## Acceptance Checklist
A UI change is ready when:
1. **Tokens only** — no ad-hoc hex/radii/shadows.
2. **Landing parity** — public surfaces stay consistent with the live page.
3. **Hierarchy intact** — `font-normal` display, bold reserved for labels/eyebrows/buttons, three-gray text ramp respected.
4. **Black CTA, teal status** — primary action is never teal.
5. **Loading / empty / error / success** states are explicit but visually subtle (dot + label, never modal-heavy).
6. **Responsive** at mobile, tablet, desktop. Container clamps respected.
7. **No heavy shadows**, no purple-blue gradients, no emoji, no webfont add.
8. **Overlays opaque**, hero/header allowed blur.
9. **Motion uses `--ease-soft-spring`**, durations match the bands above.
10. **Evidence state surfaced** on every case and result: source, suite version, verdict, grader, reviewer.

## References
- `app/globals.css` — production token source.
- `c-design/Caudals Design System/colors_and_type.css` — portable mirror.
- `c-design/Caudals Design System/preview/*.html` — visual reference cards.
- `c-design/Caudals Design System/ui_kits/marketing/index.html` — landing recreation.
- `components/landing/*` — live marketing primitives.
- `components/ui/*` — shadcn primitives (style `new-york`, base `zinc`).
