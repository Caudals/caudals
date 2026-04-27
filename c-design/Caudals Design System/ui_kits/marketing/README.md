# Caudals — Marketing UI kit

Recreation of the public marketing surface (`/`, `/browse`, footer). Source: `components/landing/*`, `components/ui/header.tsx`, `components/marketing/footer.tsx` in Caudals/caudals.

Open `index.html` to view the assembled page (hero → features → how-it-works → CTA → footer). React + Babel inline; reuses `colors_and_type.css` from the system root.

## Components

- `Header.jsx` — sticky 64px header, transparent on top, glassy on scroll, mark + wordmark + nav + Sign in / Sign up.
- `Hero.jsx` — eyebrow chip + display headline w/ serif-italic accent + subhead + pill waitlist + trust strip + glass console preview.
- `Features.jsx` — 3-col grid of capability tiles (icon → title → 260px-wide description).
- `HowItWorks.jsx` — segmented buyers/suppliers toggle + 4-step grid welded by gap-px hairlines.
- `CTA.jsx` — closing block, two big CTAs.
- `Footer.jsx` — 4-column footer + social row.
