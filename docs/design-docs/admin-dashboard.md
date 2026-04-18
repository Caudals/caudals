# Admin Dashboard Blueprint

## Purpose
Define the private Caudals operator dashboard for the B2B dataset marketplace pivot.

The admin dashboard is not a public marketplace preview. It is the operational control room for leads, supplier assets, dataset builds, rights, QA, catalog readiness, and commercial follow-through.

## Core Jobs
- Triage buyer and supplier leads.
- Convert qualified leads into feasibility studies, pilot builds, or complete dataset builds.
- Track supplier assets, source access, rights, PII status, and provenance.
- Track dataset build stages from ingestion through QA and delivery.
- Prepare catalog listings and private offers.
- Monitor commercial status: quote, contract, invoice/payment, renewal, supplier revenue share.

## IA Zones
1. Intake: contact form submissions, waitlist leads, direct sales notes, buyer/supplier classification.
2. Qualification: industry, use case, data type, geography, freshness, budget, timeline, sensitivity, rights confidence.
3. Supplier Assets: source metadata, access method, schema profile, PII risk, permitted use, refresh cadence.
4. Dataset Builds: feasibility, pilot, full build, pipeline stage, owner, blocker, QA status.
5. Catalog: listing draft, sample preview, data dictionary, quality score, pricing, visibility.
6. Commercial Ops: quote, contract, invoice, payment state, supplier revenue share, renewal.
7. Audit: immutable record of rights, PII, pricing, publication, and delivery changes.

## Required Entrypoints
Future route names can change during implementation, but the dashboard must expose these operational areas:
- Admin overview
- Leads
- Supplier assets
- Dataset builds
- Catalog listings
- Commercial operations
- Audit log
- Settings

## Visual Rules
- Use the same white/gray/black/teal design language as the landing page.
- Keep dense operational tables flat, quiet, and readable.
- Use status chips for rights, PII, QA, build stage, and publication state.
- Avoid card nesting. Use one panel level, then table rows or compact detail panes.
- High-risk actions need confirmation copy that names the exact dataset/listing affected.

## Failure Modes To Prevent
- Publishing a dataset without rights and PII status.
- Delivering a buyer artifact without QA and license summary.
- Letting a supplier asset sit without owner, next action, or qualification state.
- Showing marketplace pricing without source/licensing cost context.
- Hiding expired data freshness or refresh-cadence obligations.
- Losing the audit trail for high-risk status changes.

## Acceptance
- Critical operational loops are reachable in two clicks from the admin overview.
- Every lead/build/listing has an owner, status, next action, and timestamp.
- Rights, provenance, PII, and QA signals are always visible before publication or delivery.
- Empty states push operators toward the next useful action, not generic placeholder copy.
