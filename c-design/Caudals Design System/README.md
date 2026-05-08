# Caudals Design System

Caudals is a **B2B AI dataset marketplace**. The product helps companies that need training data for AI models meet companies that have data to monetize. Caudals sources, processes, anonymizes (GDPR), and delivers ML-ready datasets — Parquet, JSON-Lines, CSV, TFRecords — across logistics, retail, healthcare, agriculture and more.

Tagline (from the marketing site): *"Professional datasets for AI, **tailored**."*

## Source materials

- `uploads/brand.png` — the brand mark provided by the user (three slanted "data slab" bars, solid black). Stored as `assets/brand_mark.png`.
- GitHub repo **Caudals/caudals** (private). Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + shadcn/ui (style: `new-york`, base color: `zinc`) + Radix + lucide-react. Files referenced in this system:
  - `app/globals.css` — token source of truth (mirrored in `colors_and_type.css`).
  - `app/icon.svg`, `public/caudals_logo_black.svg`, `public/caudals_logo_white.svg` — logo set (mirrored in `assets/`).
  - `components/ui/*` — shadcn primitives (button, card, badge, input, header, sidebar, …).
  - `components/landing/*` — marketing surface (hero, features, how-it-works, stats, CTA, …).
  - `components/marketing/footer.tsx` — site footer.
  - `components/browse/dataset-card-improved.tsx` — the canonical product card.
  - `app/(home)/browse/browse-client.tsx` — public catalog page.
  - `docs/DESIGN.md`, `docs/FRONTEND.md`, `AGENTS.md`, `docs/ARCHITECTURE.md` — written governance.

## Product Surfaces

The current product exposes a narrow public funnel plus private internal operations. Future buyer and supplier workspaces must use the same design language but stay hidden until the B2B marketplace model is redesigned end-to-end.

| Surface | Path | Primary actions |
|---|---|---|
| **Public funnel** | `/`, `/contact`, `/blog` | Explain the offer, capture buyer demand, capture supplier monetization interest |
| **Internal admin** | `/admin/*` | Triage leads, track rights/provenance/PII, manage dataset builds, QA, pricing, contracts, and delivery |
| **Future buyer workspace** | hidden | Submit dataset briefs, review previews/QA, manage delivery |
| **Future supplier workspace** | hidden | Offer data assets, review rights status, track listing/commercial state |

Marketplace browsing, buyer workspaces, supplier portals, payments, and self-serve authenticated surfaces remain hidden until redesigned for the B2B model.

---

## Index — what's in this folder

- `README.md` — this file. Brand context + content/visual fundamentals + iconography.
- `SKILL.md` — agent skill manifest, makes this folder usable as an Agent Skill.
- `colors_and_type.css` — single source of truth for tokens. Import it from anywhere.
- `assets/`
  - `caudals_logo_black.svg`, `caudals_logo_white.svg` — full mark on light / dark.
  - `caudals_icon.svg` — square app icon (white tile, black mark, 120px corner radius).
  - `brand_mark.png` — original user-supplied mark.
- `preview/` — small HTML cards that populate the Design System tab (colors, type, components, brand).
- `ui_kits/marketing/` — high-fidelity recreation of the public site (hero, features, how-it-works, footer).
- `ui_kits/requester/` — historical buyer-workspace prototype asset; use only as visual reference until the B2B buyer IA is redesigned.

---

## CONTENT FUNDAMENTALS

**Voice:** confident, plain, business-class. Caudals talks like a competent operations team, not like a consumer app and not like an enterprise sales deck. No hype words ("revolutionary", "supercharge"), no exclamation marks in product copy, no jargon for jargon's sake.

**Person:** Default to **plural we** for Caudals ("We source, process, and deliver…", "Our team contacts supplier companies…"). Address the reader as **you / your team** when calling them to act ("Tell us what data you need", "Your dataset gets a public listing"). Never "users" in user-facing copy; say "buyers", "supplier companies", "operators", or "admins".

**Casing:**
- Sentence case for buttons, labels, nav, headings ("Request access", "How it works", "Browse requests"). Never Title Case.
- ALL CAPS only for **micro-labels** rendered with `letter-spacing: 0.12em` — column headers ("DATASET", "INDUSTRY"), eyebrow tags ("LIVE"), console chrome ("DATA MARKETPLACE CONSOLE"), status pills ("AVAILABLE", "PROCESSING").
- Never SHOUT in body copy or buttons.

**Sentence length:** short. Two sentences max for a card description. Hero subhead is one sentence.

**Numbers & trust signals:** numbers are concrete and should always be present where they exist — "98.4%", "2.4M records", "1-3 weeks", "<2w", "$24,000 reward". Always tabular-nums for dataset/financial numerics.

**Localization:** the product ships in **English (en)** and **Spanish (es)**. Spain (`ES`) is treated as a strong signal for Spanish locale routing. All user-visible strings go through `t()`. Don't ship hardcoded English in app/marketing/auth/PWA.

**Emoji:** **never** in product UI. The marketing site, the app, the dataset cards — all emoji-free. Use lucide icons instead.

**Sample copy** (verbatim from the codebase):
- Hero eyebrow: *"B2B data marketplace for AI teams"*
- Hero title: *"Professional datasets for AI **tailored**"* (the last word in serif italic teal)
- Hero subhead: *"We source, process, and deliver ML-ready datasets so your team can build models faster."*
- Section eyebrow pattern: *"Capabilities"*, *"Two sides, one platform"*, *"Platform numbers"*, *"Get started"*.
- CTA buttons: *"Request access"*, *"I need a dataset"*, *"I want to sell data"*.
- Trust strip: *"Enterprise-grade processing · GDPR-compliant pipelines · Revenue share for suppliers"*.

---

## VISUAL FOUNDATIONS

**Mood.** Editorial-Apple. Light. Generous whitespace. Off-white canvas (`#f9fafb`) with white cards. Typography is the hero — a single serif italic word inside otherwise neutral display text is the signature move (`<span class="font-serif italic text-teal-700/90">tailored</span>`).

**Color palette.**
- Surfaces: `--canvas` `#f9fafb`, `--surface` `#ffffff`. No dark mode in current scope (per `docs/DESIGN.md`).
- Text: three-tier gray ramp `#111827 → #6b7280 → #9ca3af` (never pure black for body).
- Brand accent: **emerald/teal** — `#059669` primary, `#047857` hover/text-on-soft, `#ecfdf5` soft fill, `#d1fae5` soft-2. This is what makes Caudals look like Caudals. Used for eyebrows, status dots, "Live" pills, confirmations, focus ring, primary chart series.
- Display accent: `--accent-teal` `#0f766e` — only used inside the serif-italic word in headlines, at ~90% opacity.
- CTA: near-black `#111827`. **Primary buttons are black, not teal.** Teal is for state and emphasis; black is for action. This contrast is deliberate.
- Semantics: danger `#dc2626`, warning `#d97706`, info `#2563eb` — each with a `-soft` 50-tint background.
- Borders: `--border-soft` `#f3f4f6` (hairlines, dividers) vs `--border-strong` `#e5e7eb` (inputs, must-be-seen edges).

**Typography.**
- Family: native system stack — `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, …` There is **no webfont** loaded. Display headings get tight tracking (`-0.02em` to `-0.03em`).
- Display weight is `400` (font-normal), not bold. Boldness is reserved for tags, eyebrows, button copy, table column headers, status pills.
- Serif family: `"New York", "Iowa", Georgia, serif` — used **only** italic, **only** for one or two words inside a display headline, **only** in `text-teal-700/90`.
- Mono: SFMono / Menlo stack — used inside dataset value chips and console mockups.
- Hierarchy: hero uses `text-5xl → text-7xl → text-8xl` (48 → 72 → 96). Section H2 is `text-4xl → text-5xl`. Card H3 is `text-lg font-bold`.
- Tabular nums on every number that scrolls in a list (datasets, prices, counts).

**Spacing & layout.**
- 4-pt base scale (`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 96 / 128`) — Tailwind defaults.
- Marketing container: `max-w-5xl` (most sections) or `max-w-7xl` (header / dataset grid).
- Section vertical rhythm: `py-24 sm:py-32` for content sections, `py-32 sm:py-48` for the closing CTA.
- Header is `h-16` sticky, transparent at top, `bg-white/40 backdrop-blur-[22px]` once scrolled. Side gutters `px-6 sm:px-8 lg:px-12`.
- Grids inside cards use a hairline divider technique — `gap-px bg-gray-100` so children sit on a 1px gray field, giving "panels welded together" without explicit borders.

**Backgrounds.**
- 95% white. The hero has a subtle Spline 3D scene (full-bleed, behind everything, `opacity-85`) with a `bg-gradient-to-t from-white to-transparent` fade at the bottom that hands off cleanly to the next section. No repeating patterns, no textures, no grain elsewhere.
- Decorative gradients are **never** purple-blue. The only gradient in the system is the white→transparent protection gradient on the hero.

**Borders, cards, shadows.**
- Cards: `bg-white border border-slate-200 rounded-xl shadow-sm`. On hover, `border-slate-300 shadow-md` and `group-hover:scale-105` on the inner image only.
- Hairlines (between rows in tables, between cards in a grid): `border-gray-100` / `divide-gray-100`.
- Hero preview "console" card: `glass-card` recipe — `bg-white/72`, `backdrop-blur-2xl`, `rounded-xl`, `border-gray-200/60`, and the very deep soft drop `0 48px 120px -56px rgba(15,23,42,0.62)`.
- Two shadow tiers: `shadow-xs` (`0 1px 2px 0 rgba(0,0,0,0.05)`) for inputs/buttons, `shadow-sm` for cards, `shadow-overlay` for popovers, `shadow-hero` for the marquee preview. No glow, no inner shadow.

**Corner radii.**
- 6 / 8 / 10 / 12 / 16 / 14 / 999. Almost everything is `rounded-md` (10px) or `rounded-xl` (16px). Dataset cards are `rounded-xl`. Buttons are `rounded-md` everywhere except in the **hero waitlist input + button** where they are `rounded-full` to read as "join the waitlist" instead of "form field".
- `rounded-pill` (`9999px`) is reserved for: the waitlist input/CTA pair, status dots, tiny inline "live" indicators.

**Hover & press.**
- Hover on links: gray-500 → black, `transition-colors`.
- Hover on cards: lift 4px (`hover-lift` recipe) and shadow upgrade.
- Hover on primary CTA: `hover:bg-black/90 hover:scale-[1.02]`.
- Hover on icon tiles in the features grid: gray-50 bg → teal-50 bg, gray-400 fg → teal-600 fg.
- Press: no explicit shrink; rely on `transition-all` defaults and lower opacity (`disabled:opacity-50` / `disabled:opacity-70`).

**Focus.**
- 3px ring at `--accent` (`#059669`) with `ring-offset-2`. Always visible. Inputs: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`.

**Transparency & blur.**
- The header uses `bg-white/40 backdrop-blur-[22px]` after scroll. Hero waitlist input is `bg-white/60 backdrop-blur-sm`. Hero preview is `bg-white/72 backdrop-blur-2xl`. Outside hero/header, opaque surfaces only — overlays (dropdowns, dialogs, popovers, sheets) are forced opaque by the global `[data-slot="*-content"]` rule in `globals.css`. The pattern: blur reads as "floating UI"; opaque reads as "settled UI".

**Animation.**
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (the "soft spring") for everything that moves.
- Durations: 150ms (interactive feedback), 300ms (component state), 500–800ms (entrance only).
- Entrance pattern: `opacity 0 → 1`, `y: 20 → 0`, `duration: 0.5–0.8`, staggered by `0.05–0.1s`. Used via Framer Motion in landing sections.
- Status indicator: `animate-pulse` on the small teal dot inside the "LIVE" pill and the eyebrow chip.
- No bounces, no spring overshoots, no parallax beyond the hero Spline scene.

**Imagery.**
- Dataset cards have a `aspect-[16/9]` photographic image at the top — natural color, not stylized, not B&W. On hover the image scales 1.05x inside its `overflow-hidden` frame. Use real photography placeholders only; never illustration or AI-stock-y gradients.

**Layout rules.**
- Sticky 64px header.
- Content max-widths: `max-w-5xl` (marketing copy), `max-w-7xl` (catalog grid + header).
- Sidebar in app shells: 256px (`w-64`) — see Tailwind sidebar primitive in `components/ui/sidebar.tsx`.

---

## ICONOGRAPHY

**Library:** [`lucide-react`](https://lucide.dev) — single source of truth, `iconLibrary: "lucide"` in `components.json`. Default size on buttons is `size-4` (16px). Default stroke weight is `2` (lucide default). Linear, two-tone-by-color icons. Icons are **never** filled, never colorized — they take the current text color of their container.

**Usage patterns:**
- **Feature/capability tiles:** 48×48 rounded-md tile, `bg-gray-50 text-gray-400`, with a 24×24 lucide icon. On hover the tile flips to `bg-teal-50 text-teal-600`.
- **Step badges:** 40×40 rounded-md tile, `bg-teal-50 text-teal-600`, with a 20×20 icon and `group-hover:scale-110`.
- **Inline metric / row icons:** 16×16 (`h-4 w-4`) at `text-slate-500`, paired with a number in `text-xs font-medium`.
- **Nav items in sidebar:** 14×14 (`h-3.5 w-3.5`) with bold 12px label.
- **Small social icons in footer:** 20×20, `currentColor`, `text-slate-500 hover:text-foreground`.

**Common icons in use** (from the codebase, pull these from lucide-react):
`Database`, `ShieldCheck`, `Zap`, `Activity`, `BarChart3`, `Globe2`, `Upload`, `Search`, `Settings`, `CreditCard`, `Package`, `Sparkles`, `User`, `Wallet`, `LayoutDashboard`, `ListChecks`, `CheckCircle2`, `Clock`, `Users`, `ArrowRight`, `Loader2`, `Menu`. Plus `@radix-ui/react-icons` for some shadcn primitives.

**Emoji:** **not used.** Anywhere.

**Unicode chars as icons:** not used. (No `→`, `★`, `•` — those are lucide `ArrowRight`, `Star`, `Circle`.)

**Logo set** (in `assets/`):
- `caudals_logo_black.svg` — the mark on transparent / light backgrounds. Three slanted bars at growing height. Default for header use at 28×28 next to wordmark "Caudals" in `text-xl font-medium tracking-tight text-black`.
- `caudals_logo_white.svg` — the mark on dark backgrounds.
- `caudals_icon.svg` — favicon / app tile (white square w/ 120px radius, black mark inset).
- `brand_mark.png` — the original PNG provided by the user.

The mark itself is metaphorically *layered datasets / data slabs growing in scale* — read it as "small dataset → bigger dataset → biggest dataset". Always pair the mark with the wordmark "Caudals" in the header.

---

## Index — files in this system

Root:
- `README.md` — this file (brand overview + all the foundations).
- `SKILL.md` — cross-compatible Agent Skill manifest.
- `colors_and_type.css` — CSS variables for colors, fonts, semantic tokens.
- `fonts/` — empty (system SF stack; no webfont files required).
- `assets/` — logos (`caudals_logo_black.svg`, `caudals_logo_white.svg`, `caudals_icon.svg`), `brand_mark.png`.
- `preview/` — small HTML cards that populate the Design System tab (colors, type, spacing, shadows, buttons, inputs, badges, dataset card, feature tile, sidebar nav, stat tiles, brand mark).
- `ui_kits/` — full product recreations, one folder per surface.

UI kits:
- `ui_kits/marketing/index.html` — landing page (header · hero · features · how-it-works · CTA · footer).
- `ui_kits/requester/index.html` — historical authenticated buyer-workspace prototype (Dashboard · Catalog · Requests · Billing), tab state persisted to localStorage.

---

## Caveats / known substitutions

- **No webfonts** — the system uses native SF Pro / system stack, so no font files needed in `fonts/`. If you want a closer match on non-Apple devices, **Inter** is the safest substitute, but the codebase intentionally avoids it.
- The hero's 3D Spline scene (`@splinetool/react-spline`) is not recreated — UI kits use a static white background instead.
- Icons use a CDN/lucide reference, not bundled SVGs. (The repo also uses lucide as a runtime dep.)
- Dark mode is **out of scope** per `docs/DESIGN.md`.
