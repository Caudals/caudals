Goal: write a launch spec for Caudals that I can review, then stop. Don't implement anything during this goal.

Objective: launch Caudals with a polished, production-ready product and win as many users and paying customers as possible, as fast as possible. Be ambitious when generating ideas.

## 1. Understand the business and the product
Read these in order: AGENTS.md, docs/product-specs/overview.md, docs/index.md, docs/ARCHITECTURE.md, docs/DESIGN.md, docs/FRONTEND.md, docs/TOOLS.md, docs/evals/AGENTS.md, docs/product-specs/evals-platform-implementation-spec.md. Skim ../leads/AGENTS.md for the ops and outreach side.
Ignore previous recent specs documents. Don't read or reuse them, start from scratch instead.

Then inspect the real product without changing anything:
- Code: /demo, /workspace (including /workspace/signup), /ops, /review, shared reports, /api/evals/v1, entitlements and plan limits, model routes, and the provider reservation/attempt path.
- Live: caudals.com, caudals.com/en/demo and app.caudals.com.

## 2. Write the spec
Write it as one file: docs/product-specs/launch-spec.md. Make it easy for me to review: plain language, short sections, tables where they help and a one-page executive summary at the top.

What it should cover:
1. Executive summary: what "launch-ready" means as measurable criteria (the path from visitor to demo to free sign-up to paid customer works end to end, the target for first paying customers, quality bars).
3. Decisions for me: a table with the decision, the options, your recommendation and what it blocks.
4. Product (VERY VERY IMPORTANT): new features, missing components, and work to finish or expand. 
For each item give the problem, who it's for, a user story, acceptance criteria, priority and rough size. 
Cover at least: first-run onboarding and activation, the demo → sign-up → paid conversion path, workspace UX and navigation, run setup and results, reports and sharing, monthly re-runs and regression alerts, integrations (CI webhook, Slack/email alerts, API), sector case libraries, the expert review workflow, ops efficiency, notifications and lifecycle emails, help and docs, trust (security, data handling, DPA), EN/ES parity, accessibility, performance, reliability and observability, and product analytics.
UI/UX polish: a concrete screen-by-screen list.
Token (credit) system: a full design where users top up a balance and spend it on our AI models for their evaluations. Cover:
   - the unit of account (credits or raw tokens) and why;
   - a per-model price table with our cost, our margin and how prices get updated;
   - the free grant and per-plan allowances;
   - top-up packs and auto-recharge;
   - a cost estimate shown before each run;
   - reservation → settlement → refund on failure, built on the existing reservation/attempt path and entitlements;
   - an append-only, idempotent ledger with an audit trail;
   - spend caps, low-balance alerts and credit expiry;
   - a bring-your-own provider key option;
   - customer usage and billing screens;
   - ops tools for grants, refunds and adjustments;
   - payment provider, invoicing and Spanish VAT (IVA);
   - abuse and fraud controls;
   - data model, APIs and migrations;
   - how credits coexist with fixed-price pilots, subscriptions and expert dataset builds.
Go-to-market: the ICP, a plan for the first paying customers, pricing and packaging (what is public and what is quoted), the demo/free-plan funnel, outbound (Warmbly, Apollo, RocketReach), content and the newsletter, partners and integrators, the launch sequence and calendar, sales assets (case study, deck, one-pager, proposal and contract templates), and the metrics and targets to track every week. Use web research with dated sources. Never invent market numbers, customers or results. This is the part where we are blocked right now. We have an MVP but we're struggling trying to sell it.
Work packages: an ordered list, each sized for one AI agent session, with ID, goal, scope, out of scope, dependencies, files and areas touched, migrations, acceptance criteria, tests and verification, risks, and rollout or feature flag. Mark which packages can run in parallel and show the critical path to launch.
Non-goals and risks.
## Constraints
- Keep the pricing tailored
Work in main branch. Deploy after each work package is finished
- Only write the spec file. No code changes, migrations, deploys, commits, outbound messages or paid API calls.

## Questions
Ask me about critical decisions with the question tool, with your recommended option listed first. Draft the spec first so the questions are concrete. Then add my answers to the spec and log them in section 3. 

## Done when
docs/product-specs/spec-v2.md exists with all 9 sections filled in, every work package has every field listed above, every critical decision is either answered by me or listed as open with a recommendation, and nothing outside that file has changed. Then stop and reply with a link to the file, a 10-line summary and the decisions still open. Implementation starts only after I approve the spec.