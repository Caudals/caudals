# Phase 19 - Cross-Role Dashboard Redesign With Design-Image Parity

- Status: IN_PROGRESS
- Priority: P0
- Owner: agent
- Last Updated: 2026-03-04

## Goal
- Redesign requester, contributor, and admin dashboard surfaces page-by-page so the implemented UI closely matches the visual direction in `/design-images` (repo path: `docs/design-docs/design-images/`) while preserving role workflows and improving usability.

## Exit Criteria
- Every route in the dashboard coverage matrix for requester, contributor, and admin has been redesigned and validated.
- Every page task follows the mandatory 3-step loop: **Analyze current UX**, **Draft redesign**, **Implement and verify**, before moving to the next page.
- Shared shell quality is upgraded across all roles, including a polished sidebar design, active states, and responsive behavior.
- Dashboard section page headers are redesigned to match reference-image design language; current banner/card-style header blocks are removed and replaced by improved system-aligned headers.
- Sidebar top area uses profile information + profile photo (not the Caudals logo), with compact spacing that keeps all sidebar sections visible without internal scrolling on target desktop viewport.
- Collapsible sidebar behavior is validated for alignment and equal margins/padding across all items and groups.
- Functional gaps discovered during redesign are explicitly handled (implemented, deferred with rationale, or tracked as debt).
- Frontend validation evidence is complete (Chrome DevTools MCP console/network/interaction checks + required screenshots).

## Queue
- Queue Position: 1 (user-requested)
- Blocking Dependencies: none

## Scope Context
- This phase is an implementation handoff plan intended for Gemini 3.1 Pro Preview execution.
- Canonical design contracts remain active from:
  - `docs/design-docs/ui-ux-design-system.md`
  - `docs/design-docs/dashboard-role-blueprints.md`
  - `docs/DESIGN.md`
  - `docs/FRONTEND.md`
- Mandatory visual references are all PNG files in:
  - `/design-images` (requested alias)
  - `docs/design-docs/design-images/` (repository path)
- Route ownership and role boundaries must remain strict (`/requester/*`, `/contributor/*`, `/admin/*`).
- Major PWA redesign remains out of scope.

## Mandatory Execution Protocol (Per Page)
For every dashboard page task in this phase, Gemini must execute this sequence before moving to the next page:

1. Analyze current UI/UX for the target page:
   - assess information hierarchy, friction points, weak affordances, and visual debt,
   - compare against relevant PNG references from `docs/design-docs/design-images/`,
   - identify whether additive functionality is needed to improve clarity, speed, or trust.
2. Draft the redesign approach for that page:
   - produce a concrete page-level redesign spec (layout, sections, component changes, interaction changes, empty/error/loading states),
   - map each major design decision to one or more reference PNG cues.
3. Implement and validate that page:
   - apply the redesign in code with the local `frontend-design` skill,
   - verify via Chrome DevTools MCP (console, network, critical interactions, screenshots),
   - only then proceed to the next page.

## Reference Image Usage Contract
- Keep at least one dashboard shell reference and one content reference visible while redesigning each page.
- Log which PNG files informed each page in task notes/validation evidence.
- Preserve the visual traits reflected in references:
  - soft-border, low-shadow surfaces,
  - clear spacing and typography hierarchy,
  - high-legibility tables/forms,
  - refined sidebar and active navigation states.

## Header Redesign Contract (All Dashboard Section Pages)
- Remove current banner/card-like page header treatments.
- Replace them with a redesigned header system aligned to image references (clean hierarchy, balanced spacing, refined action area).
- Apply the same header design language across requester/contributor/admin section pages while preserving role-specific copy and actions.
- Validate headers for desktop/tablet/mobile layout stability and action button alignment.

## Sidebar Layout Contract (All Dashboard Roles)
- Remove Caudals logo from top sidebar slot and replace with profile identity block (avatar/photo + user/workspace context).
- Sidebar navigation sections must fit within viewport without internal section scrolling on standard desktop validation viewport (`1440x900`).
- If content density exceeds available height, solve via IA compaction (group merge/relabel/spacing reduction), not scroll containers.
- Validate collapsed and expanded states for:
  - consistent item alignment,
  - equal left/right item padding,
  - equal vertical rhythm between groups and items,
  - no clipping or overlap.

## Dashboard Coverage Matrix

### Requester routes
- `/requester`
- `/requester/datasets`
- `/requester/datasets/new`
- `/requester/datasets/[id]`
- `/requester/datasets/[id]/edit`
- `/requester/files`
- `/requester/billing`
- `/requester/support`
- `/requester/support/[id]`
- `/requester/settings`
- `/requester/onboarding`
- `/requester/analytics`

### Contributor routes
- `/contributor`
- `/browse` (contributor work surface)
- `/contributor/contributions`
- `/contributor/earnings`
- `/contributor/settings`

### Admin routes
- `/admin`
- `/admin/requests`
- `/admin/submissions`
- `/admin/support`
- `/admin/payments`
- `/admin/activity`
- `/admin/users`
- `/admin/datasets`
- `/admin/featured`
- `/admin/analytics`
- `/admin/settings`

## Stages

### S1 - Baseline Audit, Image Mapping, and UX Gap Intake
- Objective: Establish baseline visual/functional issues and map each dashboard page to reference PNGs.
- Outputs: Current-state audit, per-page image reference map, functional gap list.
- Done when: Every page in the coverage matrix has a baseline assessment and assigned design-image references.
- Mapped Tasks: `P19-T01`, `P19-T02`, `P19-T03`

### S2 - Shared Shell and Sidebar Redesign
- Objective: Redesign shared dashboard shell before deep page work.
- Outputs: Updated sidebar, topbar/header patterns, page-header system, navigation state treatments, role-shell consistency rules.
- Done when: Sidebar/topbar/header quality is production-ready across requester/contributor/admin, no internal sidebar section scrolling exists, and collapsed alignment checks pass.
- Mapped Tasks: `P19-T04`, `P19-T05`, `P19-T06`

### S3 - Requester Dashboard Redesign (Page-by-Page)
- Objective: Redesign all requester routes sequentially using the mandatory 3-step loop.
- Outputs: Redesigned requester pages with improved UX and parity to reference images.
- Done when: All requester routes in coverage matrix are completed with validation evidence.
- Mapped Tasks: `P19-T07`, `P19-T08`, `P19-T09`, `P19-T10`, `P19-T11`, `P19-T12`, `P19-T13`, `P19-T14`, `P19-T15`, `P19-T16`

### S4 - Contributor Dashboard Redesign (Page-by-Page)
- Objective: Redesign contributor routes sequentially using the mandatory 3-step loop.
- Outputs: Redesigned contributor pages and `/browse` surface with stronger action clarity and payout trust cues.
- Done when: All contributor routes in coverage matrix are completed with validation evidence.
- Mapped Tasks: `P19-T17`, `P19-T18`, `P19-T19`, `P19-T20`, `P19-T21`

### S5 - Admin Dashboard Redesign (Page-by-Page)
- Objective: Redesign admin routes sequentially using the mandatory 3-step loop.
- Outputs: Redesigned high-density admin surfaces with clearer triage hierarchy and control affordances.
- Done when: All admin routes in coverage matrix are completed with validation evidence.
- Mapped Tasks: `P19-T22`, `P19-T23`, `P19-T24`, `P19-T25`, `P19-T26`, `P19-T27`, `P19-T28`, `P19-T29`, `P19-T30`, `P19-T31`

### S6 - Cross-Role Functional Uplift and Consistency Hardening
- Objective: Finalize additive functionality identified during page redesign and enforce consistency.
- Outputs: Implemented high-value functional additions, consistency fixes, debt capture for deferred items.
- Done when: Functional additions are resolved and shared interaction patterns are consistent across roles.
- Mapped Tasks: `P19-T32`, `P19-T33`

### S7 - Final Validation, Evidence, and Phase Closeout
- Objective: Complete technical + UI validation and close documentation loop.
- Outputs: Validation evidence pack, changelog, phase status updates, and closeout notes.
- Done when: Validation checklist passes and evidence links are complete.
- Mapped Tasks: `P19-T34`, `P19-T35`, `P19-T36`

## Tasks

### S1 - Baseline Audit, Image Mapping, and UX Gap Intake
- [x] `P19-T01` (P0, DONE, owner: agent) Build per-page baseline audit for all routes in the dashboard coverage matrix (current UX strengths, weaknesses, and friction points).
- [x] `P19-T02` (P0, DONE, owner: agent) Build a page-to-reference mapping from `docs/design-docs/design-images/*.png` and require citation of used PNG filenames in each page task.
- [x] `P19-T03` (P0, DONE, owner: agent) Produce a functional opportunity backlog from the audit (what to add/remove/merge), tagged by role and impact.

### S2 - Shared Shell and Sidebar Redesign
- [x] `P19-T04` (P0, DONE, owner: agent) Redesign the shared sidebar (grouping, spacing, active states, icon rhythm, collapse behavior, footer/user area) with explicit parity to reference images; replace top logo with profile block and enforce no internal sidebar section scrolling.
- [x] `P19-T05` (P0, DONE, owner: agent) Redesign shared topbar and dashboard section page headers; remove current banner/card-style headers and ship improved design-system-aligned headers.
- [x] `P19-T06` (P0, DONE, owner: agent) Update shared dashboard primitives (cards, tables, filters, forms, status chips, empty/error/loading blocks) to support page rollout.

### S3 - Requester Dashboard Redesign (Page-by-Page)
- [x] `P19-T07` (P0, DONE, owner: agent) Redesign `/requester` (overview command center).
- [x] `P19-T08` (P0, DONE, owner: agent) Redesign `/requester/datasets` (list, filters, queue modes).
- [x] `P19-T09` (P0, DONE, owner: agent) Redesign `/requester/datasets/new` (brief creation flow).
- [x] `P19-T10` (P0, DONE, owner: agent) Redesign `/requester/datasets/[id]` and `/requester/datasets/[id]/edit` (workspace + edit flow).
- [x] `P19-T11` (P1, DONE, owner: agent) Redesign `/requester/files` (exports/delivery surface).
- [x] `P19-T12` (P0, DONE, owner: agent) Redesign `/requester/billing` (wallet + ledger + funding actions).
- [x] `P19-T13` (P1, DONE, owner: agent) Redesign `/requester/support` and `/requester/support/[id]` (ticket inbox + thread).
- [x] `P19-T14` (P1, DONE, owner: agent) Redesign `/requester/settings` (profile/org/API credentials).
- [x] `P19-T15` (P1, DONE, owner: agent) Redesign `/requester/onboarding` (setup journey clarity).
- [x] `P19-T16` (P1, DONE, owner: agent) Redesign `/requester/analytics` (insight readability and decision support).

### S4 - Contributor Dashboard Redesign (Page-by-Page)
- [x] `P19-T17` (P0, DONE, owner: agent) Redesign `/contributor` (action inbox and progress center).
- [x] `P19-T18` (P0, DONE, owner: agent) Redesign `/browse` for contributor opportunity discovery. Do not redirect to the marketing site /browse page. Instead, create a new page in the app router at `/contributor/browse` (app.caudals.com/contributor/browse) and recommend the available datasets for the user to contribute and browse.
- [x] `P19-T19` (P0, DONE, owner: agent) Redesign `/contributor/contributions` (feedback and resubmission workflow).
- [x] `P19-T20` (P0, DONE, owner: agent) Redesign `/contributor/earnings` (payout trust and timeline clarity).
- [x] `P19-T21` (P1, DONE, owner: agent) Redesign `/contributor/settings` (profile and payout readiness settings).

### S5 - Admin Dashboard Redesign (Page-by-Page)
- [x] `P19-T22` (P0, DONE, owner: agent) Redesign `/admin` (control center triage board).
- [x] `P19-T23` (P0, DONE, owner: agent) Redesign `/admin/requests` (request moderation queue).
- [x] `P19-T24` (P0, DONE, owner: agent) Redesign `/admin/submissions` (submission moderation queue).
- [x] `P19-T25` (P0, DONE, owner: agent) Redesign `/admin/support` (support + waitlist operations).
- [x] `P19-T26` (P0, DONE, owner: agent) Redesign `/admin/payments` (payout/funding risk management).
- [x] `P19-T27` (P1, DONE, owner: agent) Redesign `/admin/activity` (audit readability and filtering ergonomics).
- [x] `P19-T28` (P1, DONE, owner: agent) Redesign `/admin/users` (role management ergonomics and safeguards).
- [x] `P19-T29` (P1, DONE, owner: agent) Redesign `/admin/datasets` and `/admin/featured` (catalog governance and merchandising).
- [x] `P19-T30` (P1, DONE, owner: agent) Redesign `/admin/analytics` (platform intelligence readability).
- [x] `P19-T31` (P1, DONE, owner: agent) Redesign `/admin/settings` (operational configuration UX).

### S6 - Cross-Role Functional Uplift and Consistency Hardening
- [x] `P19-T32` (P0, DONE, owner: agent) Implement approved cross-role functional additions discovered during page analyses (priority: activation, throughput, trust).
- [x] `P19-T33` (P1, DONE, owner: agent) Run consistency hardening pass for shared components, spacing, labels, statuses, and interaction patterns.

### S7 - Final Validation, Evidence, and Phase Closeout
- [x] `P19-T34` (P0, DONE, owner: agent) Execute full frontend validation suite (typecheck, lint/tests, role smoke where relevant).
- [x] `P19-T35` (P0, DONE, owner: agent) Complete Chrome DevTools MCP verification for all redesigned routes (console/network/interactions + desktop/tablet/mobile screenshots).
- [x] `P19-T36` (P1, DONE, owner: agent) Finalize docs/logging updates and closeout notes (phase file status, changelog, validation log, tech debt updates if needed).

## Subtasks (Mandatory Pattern For Every Page Task)
- [ ] `P19-TXX-S01` Analyze current page UX and compare directly to selected `/design-images` references.
- [ ] `P19-TXX-S02` Draft page redesign spec (layout/component/interaction changes + functional additions if needed).
- [ ] `P19-TXX-S03` Implement redesign and run Chrome DevTools MCP verification before advancing.

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched scope
- relevant smoke checks for redesigned role surfaces
- Chrome DevTools MCP verification per page:
  - console: no new runtime errors,
  - network: no new failed requests caused by redesign,
  - interaction: critical action path succeeds,
  - screenshots: mobile (`390x844`), tablet (`834x1112`), desktop (`1440x900`)
- Chrome DevTools MCP shell-specific verification:
  - expanded sidebar shows all sections without internal scrolling at `1440x900`,
  - collapsed sidebar keeps icon/item alignment and equal margins,
  - top profile block (avatar + identity) renders correctly in sidebar and replaces logo,
  - redesigned page headers render without banner/card legacy UI.
- Use `docs/exec-plans/task-validation-checklist-template.md` for each completed task.

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-04-phase-19-dashboard-redesign.md`
- Validation: `docs/logs/validations/2026-03-04-phase-19-dashboard-redesign-validation.md`

## Mid-Execution Steering Notes
- Do not redesign pages in batch without finishing the 3-step loop per page.
- During page execution, first replace legacy header/banner treatment with the new shared header pattern, then adjust page internals.
- If a page requires schema-impacting functionality changes, add explicit task notes and migration validation steps before implementation.
- If a reference-image pattern conflicts with role workflow clarity, prioritize workflow clarity and document the divergence.
- Maintain strict role isolation and avoid introducing cross-role route leakage.
