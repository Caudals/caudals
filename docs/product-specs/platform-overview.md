# Platform Overview Spec

## Startup Context
Caudals is a B2B marketplace and managed operations platform for AI training datasets.

Caudals connects:
- companies that can sell or license proprietary data,
- companies that need AI-ready datasets to train or evaluate models,
- Caudals operators who source, license, clean, curate, label, package, and publish datasets.

## North Star
Make it dramatically easier for companies to turn raw, underused data into compliant AI datasets, and for AI teams to acquire trustworthy datasets without building the entire sourcing and preprocessing operation themselves.

## Product Value Axes
- Speed: shorten dataset discovery, feasibility, sourcing, and build timelines.
- Trust: verify provenance, licensing, privacy, quality, and AI-training rights.
- Utility: deliver datasets in ML-ready schemas and formats with clear quality reports.
- Monetization: give supplier companies a managed path to earn from data without operating a marketplace themselves.

## Primary Outcomes
- More qualified buyer and supplier conversations through the public funnel
- Faster feasibility decisions for custom dataset opportunities
- Higher-quality datasets through Caudals-operated preprocessing, curation, and labeling
- Auditable supplier rights and buyer delivery records
- Future repeat revenue through catalog listings, private offers, subscriptions, and revenue share

## Product Surfaces
- Marketing/public (`/`, `/contact`, `/blog`)
- Internal admin dashboard (private)
- Future supplier intake and buyer marketplace surfaces (hidden until redesigned)

## Scope (Current)
- Landing page
- Contact form
- Blog
- Landing-mode route restriction
- Private operational admin access

## Non-Goals (Current)
- Public marketplace relaunch
- Buyer self-serve checkout
- Supplier self-serve portal
- Individual sample uploads
- Dark mode rollout

## KPI Set
- Funnel: qualified contact submissions, waitlist signups, reply time, discovery-call conversion
- Buyer demand: dataset briefs received, feasibility pass rate, pilot conversion rate
- Supplier supply: qualified supplier leads, data rights pass rate, pilot-listing conversion rate
- Operations: study delivery time, pilot delivery time, QA pass rate, rework rate
- Reliability: incident count, failed deploy rate, rollback frequency

## Maturity Map
Mature/production-grade domains:
- public landing/contact/blog route set
- landing-mode route restriction
- contact/waitlist intake APIs
- VPS and private dashboard access hardening

Partial or risk-prone domains to monitor:
- legacy authenticated app and schema from the retired product model
- old payments, upload, and dashboard assumptions
- SEO/copy drift back toward retired consumer-platform language
- missing future data model for supplier assets, buyer briefs, dataset builds, and catalog listings

## Product Prioritization Heuristics
1. Keep the public funnel credible and high-converting.
2. Build internal admin operations before public marketplace self-service.
3. De-risk data rights, provenance, privacy, licensing, and quality before payments.
4. Prioritize pilots that can become reusable catalog listings.
5. Do polish passes after operational behavior is reliable.
