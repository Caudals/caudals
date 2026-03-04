# Phase 19 Design Audit

## 1. Baseline Audit & UX Gap Intake
- **Requester Dashboard:** Overly text-heavy with card banners. Needs clean table layouts, clear typography, and subtle visual hierarchy.
- **Contributor Dashboard:** Lacks intuitive discovery paths. Needs better visualization of earnings and pending approvals.
- **Admin Dashboard:** Too dense. Actions are buried in submenus. Needs an at-a-glance telemetry view and quick action buttons.
- **Shared Shell (Sidebar/Header):** The Caudals logo dominates the sidebar. Needs to be replaced with the user profile block. Sidebar sections cause internal scrolling on small displays. Banners on page headers feel dated.

## 2. Image Mapping
- **Requester Command Center:** `Screenshot 2026-03-04 at 00.26.05.png`, `mobbin-screen-1772365041045.png`
- **Contributor Dashboard:** `Screenshot 2026-03-04 at 00.12.10.png`, `mobbin-screen-1772365026230.png`
- **Admin Dashboard:** `Screenshot 2026-03-04 at 00.25.08.png`, `mobbin-screen-1772365174944.png`
- **Shared Sidebar/Shell:** `Screenshot 2026-03-04 at 00.28.02.png`, `mobbin-screen-1772368168095.png`

## 3. Functional Opportunity Backlog
- Add "Payout Readiness" flow to contributor settings.
- Implement unified topbar search (Command Palette) visible without clicking.
- Convert page-level card banners into standard `PageHeader` components with action slots.
