# App redesign (app.caudals.com)

## Role
You are a senior full stack developer with a strong focus on frontend development. You are also a senior UI/UX designer focused on modern, high-quality user experience. Act as an autonomous builder: make reasonable assumptions when something isn’t specified, choose best practices, and keep the result polished and shippable.

You are expert in the following tech stack:
- React, Next.js (App Router), TypeScript
- Tailwind CSS, shadcn/ui
- Supabase (self-hosted in a vps) for auth + database
- DigitalOcean Object Storage for files

## Goal
Plan, redesign, and rebuild the application area of my startup platform that lives at app.caudals.com and corresponds to the (app) folder in this repo. The final goal is to have a complete, market-ready, polished product.

This app is where:
- Contributors, requesters, and administrators use the core platform workflows
- Users manage billing methods, account settings, profile, and platform configuration (admin)

Important:
- caudals.com corresponds to (home) folder in this repo and contains the marketing landing and browse section
- app.caudals.com corresponds to (app) folder in this repo and contains all auth screens and the full app experience

## Context / Architecture
- There are 3 role-based app experiences (views): admin, requester, contributor. Each view can have its own layout, design, sections, menus, etc.
- Each account is associated with exactly one role
- Admin can access all 3 views (for testing + administration)
- Auth + DB are in a self-hosted Supabase instance on a DigitalOcean VPS
- Storage is in DigitalOcean Object Storage

## Hard requirements
1) Start with a full extensive plan before coding
- First, analyze how the platform works.
- Extract requirements and current features from the existing codebase and Supabase schema.
- Think about and decide what is the best layout for the app shell and design.
- You should also implement new features that are particularly useful and that could improve/enrich our platform.
- Propose a complete plan for the refactor: app shell layout, role-based navigation, page map, key workflows, and implementation steps.
- Write the entire plan as text before implementing anything.
- The plan should describe, for each role, the pages and sections that are required (and that will appear in the sidebar), and the flows and features that each one of them should have.

1) App layout + views
- Decide the best app shell layout/design for this product.
- For each role (admin/requester/contributor), define:
  - sections, menus, pages
  - required workflows and UX structure that fits the role
  - information architecture that is intuitive and organized
- The design may differ per role to better fit each user type.
- The user icon and name should be located in the bottom part of the left sidebar.

1) Essential pages across roles
- Include dashboard home page, Billing/Earnings, analytics, and settings for all 3 views.
- Admin Billing/Earnings must support:
  - manage payments and payouts
  - platform percentages/commissions
  - generate invoices for custom pricing plans
- Admin must also include:
  - a page to create and manage featured ads
- The role switcher should be minimal and only visible only by admins, and hidden for requesters/contributors.

1) Real data only (no placeholders)
- Discard the current (app) dashboard code completely. It was only for experimentation and testing purposes.
- Do not reuse existing (app) components/pages.
- Do not show fake data anywhere.
- All sections must be powered by real API/DB/platform data (Supabase queries, server actions, and/or backend logic as appropriate).

1) Fully functional product (production-ready)
- Implement real end-to-end features (frontend + logic + DB integration).
- Examples: settings must update user/account data in the database, billing must work, etc.
- Aim for a polished and launch-ready app.

1) shadcn/ui usage
- Use shadcn/ui for UI components (navigation, shells, forms, dialogs, tables, charts, etc).
- Use shadcn/ui cmd + k component for the command palette.
- Use shadcn charts where needed:
  - https://ui.shadcn.com/charts/area
- Use shadcn tables where needed, including:
  - multiselect
  - bulk actions
  - sorting, filtering, search

1) Datasets preview + downloads
- Requesters must be able to preview files and download datasets.
- Handle very large dataset downloads (up to TB-scale). Design and implement the UX and backend-friendly approach (streaming, resumable downloads, signed URLs, background prep jobs, etc) without using fake data.

1) Onboarding / walkthrough
- Implement onboarding and walkthrough flows for:
  - contributors
  - requesters
- Purpose: teach the main workflows and features clearly inside the app.

1) i18n translations (English + Spanish)
- The app default language is English.
- Add Spanish translations for every user-facing text into es.json.
- Do not miss any string. Spanish must be natural and correct (Spain-friendly neutral Spanish is fine).

1)  Responsive design
- Must work well on desktop and mobile.

## Working approach inside Cursor
- Read the repo and current (app) folder, but treat it as disposable.
- Identify current Supabase usage patterns, auth flows, and any existing API routes/server actions.
- If something must be created (tables, policies, endpoints), implement it and wire it fully.
- Keep code clean, modular, and typed.
- Ensure role-based access control is enforced both in UI and in data access.

## Output format for this message
Answer only with an "ok" if you understand the task and the requirements.

In the next messages we will:
1) Produce the full plan and build new layout for the app shell
2) implement each role (admin/requester/contributor) iteratively

Okay, we will start with step 1) planning and implementation of the new layout/app shell
- I've pasted a few images from different views of a dashboard of https://dashboard.mintlify.com/. I want you to copy this exact same style, elements, components, collapsible into icons, etc as similar as possible. The layout should look exactly the same as in the images but with the requirements of my platform. It is very important that you visualize the images and design my dashboard to be a clone of the one in the images.
- For the accent color, use the one in globals.css instead of the mintlify one. The rest do it exactly the same as in the pictures. Start building the new layout please.