# Cursor Agent Prompt — Build the MVP for a Crowdsourced Dataset Platform (Next.js + Supabase + PostgreSQL + shadcn/ui + Stripe)

You are a **senior staff engineer** inside the Cursor AI IDE. Act as a **project bootstrapper + code generator + implementer**. Work iteratively and produce **production-grade code** with excellent structure, docs, and tests. When something is ambiguous, **choose sane defaults** and proceed.

Our product: a platform where **organizations** post dataset requests and **contributors** upload data (files of any type/size). Roles: `admin`, `requester`, `contributor`. Core flows: post requests, browse & filter, contribute/upload, review/approve, Stripe payments (Connect) for payouts, platform commission, dashboards, notifications.

We want a **monolithic** repo using **Next.js App Router** with **API Routes** as our backend. We will use **Supabase + PostgreSQL** (DB, Auth, optionally Storage) and **Stripe**. We want **shadcn/ui** across the UI, a **light theme** with a modern palette (white / off-white / linen / beige / light gray), and **subtle OpenAI-style gradients** for highlights (sparingly). The hero section is centered with **two CTAs**.

---

## 0) Project Guardrails

- **Language/Framework**: Next.js (App Router), React 18, TypeScript, Node 18+.
- **Styling**: Tailwind CSS + shadcn/ui + Radix primitives.
- **Design system**: Light theme with custom tokens; gradients in the OpenAI aesthetic (soft, ethereal, subtle). Avoid heavy saturation; use gradients only for hero accents, CTA backgrounds, section dividers.
- **Data**: Supabase (PostgreSQL) via **Prisma** ORM. Enable **RLS** with policies (explicitly generate SQL migration policies).
- **Auth**: Supabase Auth (email/password initially; social providers can be added later).
- **Storage**: Start with **Supabase Storage** provider, but design a **pluggable storage interface** so we can add S3 later without refactoring.
- **Payments**: Stripe + Stripe Connect (Express accounts). Scaffold flows (customer payment, platform fee, payout to contributor). Implement Webhooks + signature verification.
- **Real-time**: Supabase Realtime channels for lightweight notifications; keep optional and easily removable.
- **Data Fetching**: Server Actions + Route Handlers; TanStack Query on client (where needed).
- **Validation**: `zod` + `react-hook-form`.
- **Testing**: Vitest/Jest for unit; Playwright for E2E (smoke paths).
- **Code Quality**: ESLint, Prettier, Typecheck in CI, Husky pre-commit with lint-staged.
- **DX**: A top-level `README.md` with scripts, env setup, and “First Run” guide.

---

## 1) Scaffold the Repository

**Tasks**

1. Create a new Next.js (App Router) TypeScript project.
2. Add Tailwind CSS.
3. Install dependencies:

   - UI: `shadcn/ui`, `clsx`, `lucide-react`, `framer-motion`

4. Setup shadcn/UI and generate commonly used components.

**Acceptance Criteria**

- Tailwind + shadcn theme compiles; no type errors.
- `packages.json` has scripts for lint/test/build/e2e.

---

## 2) Theming & Design System (Light)

**Tasks**

1. Configure Tailwind theme tokens to achieve a light, modern, airy aesthetic:

   - Base background: **linen/off-white** (`#FAFAF9`), surfaces: **white** (`#FFFFFF`), subtle grays: `#F5F5F4` / `#E7E5E4` / `#D6D3D1`, text: `#0F172A` (slate-900) for strong contrast, secondary text: `#475569`.
   - Accent color: OpenAI-like gradients with large, blurred radial/conic masks. Use sparingly for hero background glow, section separators, etc. our gradients should be very similar and inspired from those of the OpenAI's main page and blog.
   - Shadows: soft, subtle (no harsh drop shadows). Rounded corners: `rounded-2xl`. Generous spacing.

2. Configure shadcn UI (light theme) and typography scale (comfortable line-heights).
3. Create Tailwind utility classes for gradients:

   - `.bg-oa-radial`
   - `.bg-oa-conic`
   - `.gradient-mask` (for masked highlights)

**Acceptance Criteria**

- Global styles produce a fresh, minimal, premium feel.
- Reusable gradient utilities matching OpenAI vibe but **subtle**.
- WCAG AA contrast for text on all primary surfaces.

---

## 3) shadcn/ui Setup & Core Components

Generate via shadcn CLI (prefer these components by default across app):

- **Layout**: `header`, `footer`, `container`, `sidebar`, `shell`
- **Navigation**: `navigation-menu`, `breadcrumb`
- **Content**: `card`, `button`, `badge`, `separator`, `scroll-area`, `accordion`, `tabs`, `dialog`, `drawer`, `hover-card`, `sheet`, `sonner` (toasts)
- **Forms**: `form`, `input`, `textarea`, `select`, `checkbox`, `switch`, `slider`, `label`
- **Data**: `table` (DataTable scaffold), `pagination`
- **Feedback**: `toast`, `alert`, `alert-dialog`, `skeleton`
- **Misc**: `popover`, `tooltip`, `avatar`, `dropdown-menu`

**Acceptance Criteria**

- A `/components/ui` folder with generated shadcn components and a small doc page `/styleguide` demonstrating them.

---

## 4) Pages & Routing (App Router)

**Routes to Implement (public unless noted)**

- `/` (Landing): Central **hero** with two CTAs:

  - **Primary CTA**: “Post a dataset request” → `/dashboard/requests/new`
  - **Secondary CTA**: “Start contributing” → `/browse`
  - Subtle gradient glow behind headline; shadcn buttons.
  - Feature highlights (cards), trusted by logos (placeholder), how-it-works (3 steps).

- `/browse` (Public): Filterable/searchable list of dataset requests (cards).
- `/requests/[id]` (Public details): Overview, requirements, compensation, steps, sample templates, “Contribute” button → `/contribute/[id]`.
- `/auth/sign-in`, `/auth/sign-up` (Public): Supabase Auth UI (custom, shadcn forms).
- `/dashboard` (Protected): smart redirect by role:

  - `requester` → `/dashboard/requests`
  - `contributor` → `/dashboard/contributions`
  - `admin` → `/dashboard/admin`

- `/dashboard/requests` (Requester): list, status, spend, actions.
- `/dashboard/requests/new` (Requester): multi-step form (zod + RHF) to publish a dataset request.
- `/dashboard/contributions` (Contributor): uploads, statuses, payouts.
- `/contribute/[id]` (Contributor): upload page with large file support, requirements checklist, agreement.
- `/dashboard/admin` (Admin): users, requests, moderation, payouts overview.
- `/legal/privacy`, `/legal/terms`.

**Acceptance Criteria**

- Navigation guards: protected routes redirect to sign-in when not authenticated.
- Role-based landing on `/dashboard`.
- All pages use shadcn components consistently.

---

## 5) Auth (Supabase)

**Tasks**

1. Set up Supabase project (env vars):

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=  // server-only
   ```

2. Use `@supabase/auth-helpers-nextjs` to wire server components & middleware session.
3. Implement sign-in / sign-up UI with shadcn forms (email/password).
4. Profile model: `profiles` table with `id (uuid)`, `role (enum)`, `full_name`, `avatar_url`, timestamps. Sync `profiles.id = auth.users.id`.
5. **RLS policies**:

   - `profiles`: user can select/update own row; admin can manage all.

**Acceptance Criteria**

- Working sign-in/sign-up and logout.
- Middleware enforces protected routes.
- Role stored and accessible in session (server components).

---

## 6) Database (PostgreSQL via Prisma on Supabase)

**Entities**

- `profiles` (user metadata & role: `admin|requester|contributor`)
- `organizations` (optional now; owner: requester)
- `dataset_requests`:

  - `id`, `title`, `slug`, `description`, `requirements (jsonb)`, `reward_cents`, `currency`, `status (draft|open|paused|closed)`,
  - `requester_id (fk profiles)`, `created_at`, `updated_at`

- `contributions`:

  - `id`, `dataset_request_id`, `contributor_id`, `files (jsonb)`, `notes`, `status (pending|approved|rejected)`,
  - `reviewer_id (nullable fk profiles)`, `created_at`, `updated_at`

- `transactions`:

  - `id`, `type (charge|payout|platform_fee)`, `stripe_payment_intent_id`, `stripe_transfer_id`, `amount_cents`, `currency`,
  - `dataset_request_id`, `contribution_id`, `from_profile_id`, `to_profile_id`, `status`, timestamps

- `notifications` (optional initial): minimal for realtime.

**Tasks**

1. Create **Prisma schema** for the above.
2. Generate migrations.
3. Add **indexes** (by foreign keys, slugs, created_at).
4. Write **RLS** SQL migrations for key tables:

   - `dataset_requests`: owner (requester) can CRUD own; public can read `open`; admin full.
   - `contributions`: contributor CRUD own; requester can read for their requests; admin full.
   - Use service role in API routes for privileged server actions where necessary.

**Acceptance Criteria**

- `prisma migrate dev` runs clean against Supabase.
- RLS enabled; policies verified through helper scripts.

---

## 7) Storage Abstraction (Supabase Storage first, S3-ready)

**Tasks**

1. Create `lib/storage` with a **StorageProvider** interface:

   - `getUploadUrl(args)`, `uploadFile(args)`, `getFileUrl(args)`, `deleteFile(args)`

2. Implement `SupabaseStorageProvider`:

   - Use **Supabase Storage** buckets: `contributions/…`.
   - Support **resumable or chunked large uploads** via client strategy (e.g., chunk to Blob slices, sequential upload parts under a composite key; or use Uppy/TUS if supported; include TODO notes and fallback to standard upload for MVP).
   - Use **signed URLs** for limited-time downloads for authorized users.

3. Add `STORAGE_PROVIDER=supabase` env with easy switch to `s3` later.

**Acceptance Criteria**

- Upload of large files (≥ 2GB) works reliably with progress UI and retry.
- Files are not public by default; authorized access only via signed URL.

---

## 8) API Routes (Backend in Next.js)

**Route Handlers (examples)**

- `POST /api/requests` (requester): create dataset request (server action or route handler).
- `GET /api/requests` (public): list with filters/pagination.
- `GET /api/requests/[id]` (public): details (only `open` or if owner/admin).
- `PATCH /api/requests/[id]` (requester/admin): update/close/pause.
- `POST /api/contributions` (contributor): create + request signed upload URL(s).
- `POST /api/contributions/[id]/finalize` (contributor): finalize after upload; attach file metadata.
- `PATCH /api/contributions/[id]/review` (requester/admin): approve/reject; on `approve`, enqueue payout.
- `POST /api/stripe/webhook` (Stripe): webhook endpoint (verify signature).
- `POST /api/payments/fund` (requester): create Checkout Session / Payment Intent for funding a request.
- `POST /api/payouts/transfer` (server-only): Stripe Connect transfer on approval.

**Implementation Notes**

- Use **zod** schemas for payloads; return typed errors.
- Use Supabase **service role** only in server contexts for privileged DB ops.
- Log and handle failures cleanly; idempotency keys on payment operations.

**Acceptance Criteria**

- All routes type-safe and tested.
- Basic happy paths work via REST client (Thunder, Insomnia) or E2E tests.

---

## 9) UI Screens (shadcn first-class)

**Landing (`/`)**

- **Hero** (centered): headline, subheadline, two CTAs, gradient glow background (OpenAI-style radial), tasteful motion (framer-motion), shadcn Buttons (`primary`, `outline`).
- Sections: “How it works” (3 steps), “Who it’s for”, “Why us”, “Featured open datasets” (if any), “Powered by” (logos), footer.

**Browse (`/browse`)**

- Search + filters (status, reward range, modality tags).
- Cards: title, brief, reward per contribution, #submissions, tags, due date.
- Pagination.

**Request Detail (`/requests/[id]`)**

- Overview, requirements (rich text), steps, compensation, examples/templates, safety & privacy notes.
- CTA: contribute (auth-gates to sign-in).

**New Request (`/dashboard/requests/new`)**

- Multi-step form:

  1. Basics (title, desc),
  2. Requirements (JSON builder UI),
  3. Compensation (reward & currency),
  4. Review & publish.

- Client+server zod validation; optimistic UX.

**Contribute (`/contribute/[id]`)**

- Requirements checklist, consent attestation.
- Drag-and-drop uploader (dropzone) with progress, retry, multi-file.
- Finalize submission; show status.

**Dashboards**

- Requester: table of requests, statuses, spend, quick links to review queue.
- Contributor: list of contributions, statuses, payouts, earnings summary.
- Admin: users, requests, flags, payouts.

**Acceptance Criteria**

- All screens responsive; shadcn UI for controls/layout.
- Light theme elegance; gradients used only as accents.
- Accessibility: keyboard nav, focus rings, ARIA labels.

---

## 10) Payments (Stripe + Connect)

**Tasks**

1. Stripe keys in env:

   ```
   STRIPE_SECRET_KEY=
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
   STRIPE_WEBHOOK_SECRET=
   STRIPE_CONNECT_CLIENT_ID=  // if using OAuth for Express onboarding
   ```

2. **Connect (Express accounts)** onboarding for contributors:

   - Create account link endpoint.
   - Store `stripe_account_id` on `profiles`.

3. **Funding flow (requesters)**:

   - Create Checkout Session/Payment Intent for funding a request/budget or pay-per-approval model (MVP: pay-per-approval).

4. **Approval → Payout**:

   - On approve: Platform takes fee, transfer remainder to contributor connected account.
   - Record `transactions` rows (charge, platform_fee, payout).

5. Webhook handler: update transactions & statuses idempotently.

**Acceptance Criteria**

- Test mode fully works: fund → approve → payout (simulated).
- Clear error handling & user feedback.

---

## 11) Notifications & Realtime (MVP)

**Tasks**

- Use Supabase Realtime to notify requesters of new contributions, and contributors of approval status changes.
- Toasts + inbox (simple list) in dashboard.

**Acceptance Criteria**

- Subscriptions wired to dataset request room or user channel.
- Live updates observed across two sessions.

---

## 12) Security, Privacy, and RLS

**Tasks**

- Strict RLS policies for all tables (grant least privilege).
- Use `server` actions/route handlers for privileged operations.
- Signed URLs for any private file access; URLs short-lived.
- CSRF safe (Next.js APIs + POST only for mutations; consider CSRF token if needed).
- Rate-limit auth and upload endpoints (simple in-memory or edge kv for MVP).
- Input sanitization (zod), output encoding, helmet-like headers via Next config where applicable.

**Acceptance Criteria**

- Attempted unauthorized access denied by RLS and middleware.
- Security checklist doc included.

---

## 13) Tooling, CI, and Documentation

**Tasks**

- ESLint + Prettier configs; strict TypeScript.
- Husky pre-commit: `lint-staged` (typecheck, lint, format).
- GitHub Actions CI: install, lint, typecheck, build, test.
- Playwright E2E: sign-up → post request → contribute → approve → (mock) payout.
- `README.md`: setup, env, scripts, architecture diagram, decisions.

**Acceptance Criteria**

- Clean CI run on fresh clone.
- README good enough for a new engineer to onboard in <30 min.

---

## 14) Environment & Configuration

Create `.env.example`:

```
# Next
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
JWT_SECRET=change-me

# Storage
STORAGE_PROVIDER=supabase
SUPABASE_STORAGE_BUCKET=contributions

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=

# Misc
NODE_ENV=development
```

---

## 15) Deliverables (Initial Commit Scope)

- Working Next.js app with:

  - Landing page (hero + CTAs), browse, request detail
  - Auth (sign-in/sign-up), role-based dashboard routing
  - New Request flow (persisted)
  - Contribute flow with upload UI (persisted file metadata)
  - Basic approval flow (no real money yet), Stripe scaffolding + webhooks stubbed

- Prisma schema + migrations + RLS SQL
- shadcn components + theme + gradient utilities
- Storage provider abstraction (Supabase impl)
- Tests: minimal unit + one E2E smoke
- Docs: README + architecture overview

---

## 16) Implementation Order (Do This Now)

1. **Scaffold project** + Tailwind + shadcn + theme + core components.
2. **Configure Supabase** client + Prisma + database schema + migrations + RLS.
3. **Auth** endpoints & UI; role assignment on first login (default `contributor`, toggle in DB for testing).
4. **Pages**: `/`, `/browse`, `/requests/[id]`, `/dashboard` (+ child routes).
5. **API routes** for requests & contributions (CRUD, upload link flow).
6. **Storage provider** (Supabase) + uploader UI with progress and retry.
7. **Stripe**: keys, Connect onboarding stubs, webhook route scaffold; record transactions as placeholders (simulate success).
8. **Realtime** subscriptions + toasts (optional MVP).
9. **Testing** + CI + README.

---

## 17) UI Details & Copy (Guidance)

- **Hero headline**: “Crowdsource rich, real-world datasets—at scale.”
  Subheadline: “Post precise collection tasks. Contributors upload compliant data. You review, approve, and pay—effortlessly.”
- **Primary CTA**: “Post a dataset request”
- **Secondary CTA**: “Start contributing”
- **Gradient**: A subtle **radial** behind the headline, blurred `mix-blend-soft-light`, pastel hues (indigo → cyan → pink), opacity < 35%.
- **Cards**: soft borders (`border-neutral-200`), `rounded-2xl`, soft shadow, generous padding.
- **Focus**: visible rings, accessible contrast.
- **Motion**: tiny parallax or fade-up on scroll; never intrusive.

---

## 18) Nice-to-Haves (If Time Allows)

- Search with Postgres FTS; tag filters.
- Markdown support for request requirements with sanitization.
- Simple in-app messages per request (requester ↔ contributor) via Realtime.
- Open datasets gallery (public) toggle on a request with CC license selector.
- Analytics events (page views, funnel) with a small wrapper (can be toggled off).

---

## 19) Handoff

When done with each phase, **commit** granularly with meaningful messages. Generate/update:

- `README.md` (screenshots/gifs encouraged)
- `docs/architecture.md` (ERD, route map, sequence for upload & payout)
- `docs/security.md` (RLS, auth, secrets, webhooks)
