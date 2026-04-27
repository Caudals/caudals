# Caudals — Requester App UI kit

The buyer-facing authenticated product: catalog browsing, request intake, delivery tracking. Source: `app/(dashboard)/*` + `components/dashboard/*` in Caudals/caudals (sparse scaffolding in repo; extended to a realistic console using the system's visual foundations).

Open `index.html`. Tabs across the top switch between: **Dashboard**, **Catalog**, **Requests**, **Billing**.

## Components
- `AppShell.jsx` — sidebar + topbar chrome.
- `Dashboard.jsx` — stat row + recent requests table + live datasets panel.
- `Catalog.jsx` — filter rail + dataset grid.
- `Requests.jsx` — request intake form + in-flight request list.
- `Billing.jsx` — spend summary + invoice table.
- `Primitives.jsx` — buttons, badges, cards, fields used across screens.
