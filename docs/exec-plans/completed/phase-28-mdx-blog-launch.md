# Phase 28 - MDX Blog Launch

- Status: DONE
- Priority: P0
- Owner: agent
- Last Updated: 2026-03-27

## Goal
- Launch a production-ready public blog powered by localized MDX content so Caudals can publish product updates, dataset-ops guidance, and launch narratives from the existing marketing surface.

## Exit Criteria
- `/blog` is replaced with a fully designed editorial index page backed by MDX content.
- `/blog/[slug]` renders localized MDX articles with metadata, structured article layout, and internal navigation.
- Blog content can be authored from `content/blog/{locale}/*.mdx` with frontmatter-driven summaries.
- Topic filtering, featured story treatment, and CTA sections are implemented and responsive.
- Automated checks and UI verification evidence are logged.

## Queue
- Queue Position: 1
- Blocking Dependencies: none

## Scope Context
- User-requested work overrides the standing Phase 17/20 queue.
- Public surfaces must preserve the existing Caudals light-mode design system and translation contract.
- Existing dependencies already include `gray-matter`, `next-mdx-remote`, and `remark-gfm`, so the implementation should avoid adding new packages unless strictly necessary.
- `/blog` currently exists as a placeholder route and needs both content infrastructure and UI/UX treatment.
- `/blog` page visual direction should follow the Gemini `gemini-3.1-pro-preview` design brief captured during execution.

## Stages

### S1 - Planning and Content Architecture
- Objective: Define the phase scope and pick the MDX integration approach that fits the current Next.js app/router architecture.
- Outputs: Phase plan, content directory contract, frontmatter schema, routing model.
- Done when: The execution plan exists and implementation can proceed without unresolved architecture questions.
- Mapped Tasks: `P28-T01`

### S2 - Blog Platform Implementation
- Objective: Build the localized MDX content pipeline and public routes.
- Outputs: Content loaders, MDX renderer, `/blog`, `/blog/[slug]`, sample editorial content.
- Done when: Blog index and article pages render from MDX end-to-end.
- Mapped Tasks: `P28-T02`, `P28-T03`, `P28-T04`

### S3 - Validation and Delivery Logging
- Objective: Verify runtime quality and record delivery evidence.
- Outputs: Passing checks, browser QA, changelog entry, validation log.
- Done when: Validation evidence is stored and the phase can be archived.
- Mapped Tasks: `P28-T05`

## Tasks
- [x] `P28-T01` (P0, DONE, owner: agent) Create the phase plan and lock the localized MDX blog architecture.
- [x] `P28-T02` (P0, DONE, owner: agent) Implement localized MDX content loading, parsing, and rendering utilities.
- [x] `P28-T03` (P0, DONE, owner: agent) Replace `/blog` with the Gemini-guided editorial landing page and topic filtering UX.
- [x] `P28-T04` (P0, DONE, owner: agent) Implement `/blog/[slug]` article pages with structured layout, metadata, and related navigation.
- [x] `P28-T05` (P0, DONE, owner: agent) Run automated/browser validation and record changelog plus validation evidence.

## Validation Required
- `npm run typecheck`
- targeted lint/tests for touched scope
- `npm test -- --run`
- `npm run build`
- runtime/manual checks for `/blog` and `/blog/[slug]`

## Evidence Links
- Changelog: `docs/logs/changelog/2026-03-27-phase-28-mdx-blog-launch.md`
- Validation: `docs/logs/validations/2026-03-27-phase-28-mdx-blog-launch-validation.md`

## Mid-Execution Steering Notes
- Add new subtasks directly in this file if content modeling or localization gaps are discovered during implementation.
- If localized MDX authoring introduces follow-up debt (search, RSS, CMS sync), capture it in `docs/exec-plans/tech-debt-tracker.md` rather than widening this phase.
- Gemini design brief used: `gemini -m gemini-3.1-pro-preview -p ...` to define the `/blog` page’s “Clear Signal” editorial layout.
