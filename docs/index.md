# Docs Index

This directory is the persistent reference set for Caudals' product, architecture, design, frontend, product-spec, and tooling contracts.

## Structure
- `product-specs/overview.md`: portable startup briefing for humans, ChatGPT, Claude, coding agents, and collaborators.
- `ARCHITECTURE.md`: technical system contract and deployment/runtime model.
- `DESIGN.md`: design system and UI governance.
- `FRONTEND.md`: frontend implementation contract.
- `TOOLS.md`: operational tooling, setup commands, and troubleshooting.
- `product-specs/`: B2B dataset marketplace and managed services product contract.
- `product-specs/content-publishing-contract.md`: versioned interface between the Leads Content Suite and the public MDX blog.
- `blueprints/`: generated product blueprints and exports.
- `migrations/`: platform migration reports and cutover evidence.
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
| `docs/product-specs/overview.md` | portable product brief and business direction | product direction changes |
| `docs/ARCHITECTURE.md` | technical system contract and deployment/runtime model | architecture/runtime changes |
| `docs/DESIGN.md` | design system and UI governance | design contract changes |
| `docs/FRONTEND.md` | frontend implementation contract | frontend routing, UI, or i18n contract changes |
| `docs/TOOLS.md` | operational tooling and setup runbook | tooling workflows, setup, or troubleshooting changes |
| `docs/product-specs/*.md` | product behavior contracts and startup context | behavior/product contract changes |
| `docs/product-specs/content-publishing-contract.md` | Leads-to-site blog path, frontmatter, MDX and release contract | blog loader, route, components, or publisher changes |
| `docs/blueprints/*` | generated strategic/product artifacts | explicit blueprint generation or export updates |
| `docs/migrations/*` | migration reports, verification, and decommission gates | platform/data/auth/storage migrations |

## Governance Canon
`docs/product-specs/overview.md` is the canonical product direction. Supporting docs should align to it and avoid reintroducing obsolete workflow assumptions.
