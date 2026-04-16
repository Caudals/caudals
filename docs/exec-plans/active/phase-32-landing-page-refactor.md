# Phase 32 – Landing Page Aesthetic Refactor

## Objective
Refactor the landing page to match the clean, minimalist, editorial design of the `/blog` section, extending it with color accents and personality.

## Context
- Startup: Caudals (AI dataset operations)
- Design Goal: High-end tech, minimalist, professional, unique.
- Tech Stack: Next.js App Router, Tailwind v4, Framer Motion.
- Constraints: Preserve the existing dashboard mock in the hero. User request on 2026-04-16 superseded the earlier hero video constraint and replaced the Mux video/gradient background with a Spline ribbon.

## Stages

### S1: Core Primitives & Video Transition
- [x] P32-T01: Smooth out the bottom transition of `LandingVideoBackground` in `components/landing/video-background.tsx`. `DONE`
- [x] P32-T02: Define common design patterns (typography, spacing) for the refactor based on the blog. `DONE`

### S2: Hero & Social Proof
- [x] P32-T03: Refactor `HeroSection` (`components/landing/hero.tsx`) with editorial typography and emerald accents. `DONE`
- [x] P32-T04: Refactor `SocialProofSection` (`components/landing/social-proof.tsx`) to be cleaner and more aligned with the blog. `DONE`

### S3: Platform & Features
- [x] P32-T05: Refactor `PlatformLayersSection` (`components/landing/platform-overview.tsx`). `DONE`
- [x] P32-T06: Refactor `FeaturesSection` (`components/landing/features.tsx`). `DONE`

### S4: Process & Social Validation
- [x] P32-T07: Refactor `HowItWorksSection` (`components/landing/how-it-works.tsx`). `DONE`
- [x] P32-T08: Refactor `StatsSection` (`components/landing/stats.tsx`). `DONE`

### S5: Conversion & Support
- [x] P32-T09: Refactor `ContactSection` (`components/landing/partnerships.tsx`). `DONE`
- [x] P32-T10: Refactor `ResourceStrip` (`components/landing/resource-strip.tsx`). `DONE`
- [x] P32-T11: Refactor `PricingSection` (`components/landing/pricing.tsx`). `DONE`

### S6: Finalization
- [x] P32-T12: Refactor `FAQSection` (`components/landing/faq.tsx`). `DONE`
- [x] P32-T13: Refactor `CTASection` (`components/landing/cta.tsx`). `DONE`
- [x] P32-T14: Final polish of `app/(home)/page.tsx` and header/footer consistency. `DONE`
- [x] P32-T15: Rebalance `LandingVideoBackground` visibility after the design refactor and revalidate Mux playback/crop on desktop and mobile. `DONE`
- [x] P32-T16: Restore a working Mux clouds playback in the landing hero after the refactor and auto-propagate `LANDING_MODE` into the public dev bundle. `DONE`
- [x] P32-T17: Restore the landing hero waitlist submission flow in landing mode, allow the public `/api/waitlist` route, and align waitlist email delivery with the existing Resend fallback/error-handling pattern. `DONE`

### S7: User-Requested Hero Media Update
- [x] P32-T18: P0 `DONE` owner: agent — Replace the former hero Mux video/gradient background with the requested Spline ribbon, preserve the dashboard mock, and revalidate text visibility/responsive framing.

## Validation
- [x] Visual inspection of each section.
- [x] `npm run typecheck`
- [x] Responsive check.
- [x] Chrome DevTools MCP and Playwright responsive QA for the Spline hero ribbon.
