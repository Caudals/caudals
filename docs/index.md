# Docs Index

Persistent reference set for Caudals' product direction, architecture, design, frontend and tooling contracts.

## Structure
- `product-specs/overview.md`: canonical product brief for humans, AI assistants, coding agents and collaborators.
- `product-specs/go-to-market.md`: customer-acquisition playbook.
- `product-specs/evals-platform-implementation-spec.md`: staged evaluation-product implementation contract; `evals/work-packages/` records work-package status and release gates.
- `product-specs/content-publishing-contract.md`: interface between the Leads Content Suite and the public MDX blog.
- `ARCHITECTURE.md`: technical system contract, deployment/runtime model and planned evaluation architecture.
- `DESIGN.md`: design system and UI governance. Two languages: the platform system for authenticated surfaces (`packages/brand/platform.css`) and the editorial system for the public site.
- `FRONTEND.md`: frontend implementation contract.
- `TOOLS.md`: operational tooling, setup commands and troubleshooting.
- [Caudals Leads](https://github.com/Caudals/leads) (`../leads`): satellite repository for the
  internal B2B Leads CRM, outreach, prospecting, social and newsletter operations.
  Start at `../leads/AGENTS.md`; it indexes `docs/ARCHITECTURE.md`,
  `docs/OPERATIONS.md`, `docs/OUTREACH.md`, `docs/CONTENT.md`,
  `docs/PROSPECTING.md` and `docs/GROWTH.md`. It shares this host, network and
  PostgreSQL service but owns its own schema.

## Read/Write Matrix
| Path | Purpose | Update Trigger |
| --- | --- | --- |
| `AGENTS.md` | repository agent instructions | agent operating rules change |
| `docs/product-specs/overview.md` | product brief: offers, customers, custom datasets, expert network | direction, offers, pricing, sectors, expert network or scope change |
| `docs/product-specs/go-to-market.md` | acquisition playbook, rules of engagement, gates | targeting, outreach rules, gates or cadence change |
| `docs/product-specs/content-publishing-contract.md` | Leads-to-site blog path, frontmatter, MDX and release contract | blog loader, route, components, or publisher changes |
| `docs/ARCHITECTURE.md` | technical system contract and deployment/runtime model | architecture/runtime changes |
| `docs/DESIGN.md` | design system and UI governance | design contract changes |
| `docs/FRONTEND.md` | frontend implementation contract | frontend routing, UI, or i18n contract changes |
| `docs/TOOLS.md` | operational tooling and setup runbook | tooling workflows, setup, or troubleshooting changes |
| `docs/evals/work-packages/WP-09.md`–`WP-11.md` | Stage C implementation and evidence still required | website, scenario/tool, or customer self-service contract changes |
| `docs/evals/work-packages/WP-12.md`–`WP-13.md` | Stage D private runner and monitoring status | runner, schedule, webhook, token, alert or CRM draft changes |
| `docs/evals/work-packages/WP-14.md`–`WP-15.md` | Stage E expert work and improvement dataset release status | expert assignment, QA, dataset release, signing or follow-up validation changes |

## Governance Canon
`docs/product-specs/overview.md` is the canonical product direction; supporting docs align to it. Marketplace, supplier-portal, catalogue and non-text modality work is out of scope and must not be reintroduced as current direction.
