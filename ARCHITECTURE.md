# Caudals Architecture

## System Overview
Caudals is a multi-surface product for AI dataset operations:
- Public marketing and discovery (`/`, `/browse`, `/collaborate`, `/landing-simple`)
- Authentication (`/auth/*`)
- Role applications (`/requester/*`, `/contributor/*`, `/admin/*`)
- Mobile-first contributor companion (`/pwa/*`, currently out of scope for major refactors)

## Application Stack
- Framework: Next.js App Router (`next@16`), React 19, TypeScript
- UI: Tailwind CSS v4, Radix UI, custom component library, Shadcn UI
- Data/Auth: Supabase (Postgres + Auth + RLS)
- Payments: Stripe + Stripe Connect
- Storage: DigitalOcean Spaces (S3-compatible)
- Email: Resend
- CI/CD: GitHub Actions -> Docker Hub -> Dokploy on DigitalOcean VPS

## Code Topology
- `app/(home)/*`: marketing/public routes
- `app/(auth)/*`: sign-in/up/callback/reset flows
- `app/(app)/*`: authenticated role apps and APIs
- `components/*`: UI and domain components
- `lib/actions/*`: server action business logic
- `lib/supabase/*`: client/session/admin access wrappers
- `supabase/migrations/*`: schema history and policies

## Core Domain Flows
1. Requester dataset lifecycle:
- create request -> admin approval -> fund -> contributor submissions -> review -> export
2. Contributor lifecycle:
- browse opportunities -> upload -> submit -> review feedback -> payout lifecycle
3. Admin lifecycle:
- moderate requests/submissions -> monitor operations -> resolve support/risk queues
4. Payment spine:
- funding intents, wallet/ledger transactions, transfer events, webhook idempotency

## Infrastructure Notes
- Production runtime is self-hosted (DigitalOcean + Dokploy + self-hosted Supabase).
- Middleware handles marketing/app hostname split and `LANDING_MODE` behavior.
- `/dashboard` acts as a role-aware entrypoint; canonical requester IA is `/requester/*`.

## Agent Tool Stack
- Supabase tooling/MCP for schema and runtime data validation.
- GitHub tooling/MCP for issue, PR, and review workflows.
- Chrome DevTools MCP for frontend runtime checks and screenshot-based UI validation.

## Security and Reliability Anchors
- RLS-first data access with scoped service-role usage
- Stripe webhook replay protection and transactional consistency
- Upload guardrails and public endpoint abuse protection
- Automated quality gates in CI and runbook-driven operations

## Linked References
- `docs/generated/db-schema.md`
- `docs/product-specs/platform-overview.md`
- `docs/references/tooling-and-mcp.md`
- `docs/references/legacy/architecture-map.md`
