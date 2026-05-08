---
name: caudals-design
description: Use this skill to generate well-branded interfaces and assets for Caudals, a B2B AI dataset marketplace, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## What's in here

- `README.md` — brand overview, content fundamentals, visual foundations, iconography.
- `colors_and_type.css` — CSS variables for the palette, type ramp, and semantic tokens. Import this in every artifact.
- `assets/` — logos (SVG black + white + square icon) and the raw brand mark PNG.
- `fonts/` — empty on purpose. Caudals uses the system SF Pro stack (`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", ...`). Inter is the safest cross-platform substitute if needed.
- `preview/` — small HTML specimen cards (one concept per file).
- `ui_kits/marketing/` — React + Babel recreation of the landing page.
- `ui_kits/requester/` — React + Babel historical buyer-workspace prototype (dashboard, catalog, requests, billing).

## Quick visual rules

- Primary accent is emerald/teal (`#059669` / `#0d9488`) on off-white (`#fafafa`) surfaces. Primary buttons are **black**, not emerald — emerald is reserved for status chips, active nav, and small iconography.
- Display type is system sans at weight 400 with tight tracking (`-0.03em` on hero). Highlight a single word per headline in **italic serif** (New York / Iowa / Georgia) in muted teal — this is the signature move; use it sparingly.
- Radii: `6px` (buttons/inputs), `12–14px` (cards/panels), `9999px` (hero waitlist + segmented toggles only).
- Copy is lowercase sentence case, no emoji, plain-spoken, second person ("your team"), results-first ("in days, not months").
