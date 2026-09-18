# Evals Dashboard Design Proposal

## Overview
We're designing a focused workspace/operations dashboard for evaluation management, mirroring ElevenLabs' approach: compact sidebar navigation, contextual inspector pattern, and honest empty states. Scope is strictly routes for client setup, invitation lifecycle, and evaluation landing—no evaluation creation UI, no backend simulation.

## Layout Structure

**Desktop (1440px primary)**
- Sidebar: 240px fixed, dark canvas background, operator name pinned top, client selector below (dropdown or button), primary nav (Evaluations, Invitations, Settings)
- Context header: 56px, breadcrumb or title + role badge
- Main content: 24px gutters, 2-3 column grids where appropriate
- Floating inspector pattern: optional right panel (160–240px) for invitation metadata or eval details, slide-in on mobile

**Mobile (390px)**
- Sidebar collapses to drawer (hamburger toggle)
- Client selector moves into drawer header
- Main content uses single column, 20px gutters
- Inspector becomes full-width modal overlay

**Tablet (768px)**
- Sidebar 224px (compact), drawer remains available
- 2-column layouts acceptable for tables/lists + context

## Core Screens & States

### /ops (Client & Invitation Management)
**Clients card/section:**
- Owned clients list with invite button (black CTA)
- Row: client name, member count, last active date (teal if active today, secondary gray if stale)
- Empty state: "No clients yet. Create one to begin." + Create button
- Create form overlay: client name input, operator auto-filled read-only
- No account auto-creation; form explicit and confirmable

**Invitations section:**
- Sent invitations table: recipient email, role (Operator/Member), status (Pending/Accepted), sent date, revoke button (secondary, hover-red)
- Row hairlines, teal status badges
- Empty: "No pending invitations"
- Create invite form: email input, role radio, send button

### /workspace/evaluations
- Honest empty state if member has no evaluations: "No evaluations assigned to you yet. Ask your operator to create one."
- If populated: card/list layout, eval title, scenario name, status (Pending/In Progress/Complete), due date
- No inline creation; future artifact separate (mentioned in sidebar or banner)

### /workspace/invitations
- Pending invitations for logged-in user
- Card: workspace name, inviter, role offered, Accept/Decline buttons
- Once accepted, user joins client and redirected to /workspace/evaluations
- Declined invitations fade/remove

### /evaluation-entry (Role Check)
- Silent redirect: if Operator → /ops; if Member → /workspace/evaluations
- No landing page; role determines destination

## Component Behavior

**Client Selector**
- Persistent at top of sidebar; shows selected client name
- Dropdown or pill button; single-level, alphabetical
- Updates context header (e.g., "Evaluations · Client Name")
- Operator always visible in sidebar (pinned below selector)

**Tables**
- Hairline borders (1px, primary text at 15% opacity)
- Teal row highlight on hover
- Action icons far right (copy, revoke); confirmed before destructive

**Empty States**
- Generous vertical centering (60vh)
- Icon (optional, teal accent), primary heading, secondary explanation, CTA if applicable
- Honest messaging; no fake data

**Inspector (Future)**
- Right-side panel for invite metadata or eval details
- Toggleable; not persistent on mobile
- Shows conversation history or scenario details when available
- Separate from running app per spec

## Self-Critique

**Strengths:**
- Mirrored from ElevenLabs' proven pattern (compact, contextual)
- Routes are tightly scoped; no feature creep
- Role-based routing prevents confusion

**Limitations:**
- No visual mockups (CSS measurements untested; hairline/spacing are design intent, not implemented fact)
- Inspector pattern assumes future evaluation/conversation data; placeholder until backend ready
- Empty states are copy-heavy; refinement needed post-user-testing
- Mobile drawer behavior not fully specified (animation, gesture)
- No keyboard shortcuts or accessibility audit yet (WCAG 2.1 compliance assumed but untested)

## Deferred to Artifact
- Evaluation creation interface (separate modal/app)
- Progress tracking and result reporting
- Scenario setup (mirrors agent testing pattern but not in MVP)
- Analytics dashboard (future expansion)

All future work explicitly lives outside the running workspace app, accessed via banner link or navigation bridge.
