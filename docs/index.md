# Docs Index

Persistent reference set for Caudals' product direction, architecture, design, frontend and tooling contracts.

## Structure
- `product-specs/overview.md`: canonical product brief for humans, AI assistants, coding agents and collaborators.
- `product-specs/evals.md`: evaluation product contract and quality rules for expert-built data.
- `product-specs/go-to-market.md`: customer-acquisition playbook.
- `product-specs/content-publishing-contract.md`: interface between the Leads Content Suite and the public MDX blog.
- `ARCHITECTURE.md`: technical system contract, deployment/runtime model and planned evaluation architecture.
- `DESIGN.md`: design system and UI governance, including evaluation reports.
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
| `docs/product-specs/evals.md` | evaluation method, deliverable contract and expert-built data rules | case schema, tiers, grading, metrics, report format or expert QA change |
| `docs/product-specs/go-to-market.md` | acquisition playbook, rules of engagement, gates | targeting, outreach rules, gates or cadence change |
| `docs/product-specs/content-publishing-contract.md` | Leads-to-site blog path, frontmatter, MDX and release contract | blog loader, route, components, or publisher changes |
| `docs/ARCHITECTURE.md` | technical system contract and deployment/runtime model | architecture/runtime changes |
| `docs/DESIGN.md` | design system and UI governance | design contract changes |
| `docs/FRONTEND.md` | frontend implementation contract | frontend routing, UI, or i18n contract changes |
| `docs/TOOLS.md` | operational tooling and setup runbook | tooling workflows, setup, or troubleshooting changes |

## Governance Canon
`docs/product-specs/overview.md` is the canonical product direction; supporting docs align to it. Marketplace, supplier-portal, catalogue and non-text modality work is out of scope and must not be reintroduced as current direction.
