# Caudals Launch Specification — From Invite-Only Engine to Market

> Status: **Draft v1 for founder approval. Nothing in this document is implemented yet.**
> Date: 2026-10-08 · Scope: `caudals.com`, `app.caudals.com`, Caudals Ops/Warmbly hand-offs, go-to-market.
> Reads with: `overview.md` (product brief, canonical), `evals-platform-implementation-spec.md` (engine contract), `docs/DESIGN.md`, `docs/FRONTEND.md`.
> Approval model: approve the whole document, or approve/reject by item ID (e.g. "approve all except SS-08, MK-12; D-03 option B").

## 0. How to read this document

- §1 is the one-page summary. §2 is what exists today, with the evidence I collected. §3 is the strategy. §4 lists the decisions only founders can take; several items depend on them.
- §5 is the feature catalogue: every proposed feature, workflow, pipeline, tool and system, grouped by area. Each item has an ID, a priority and acceptance criteria that Phase 2 will verify.
- §6 lists specific polish defects found during the audit. §7 is the go-to-market plan (Spain → Europe → global). §8 defines metrics. §9 turns the catalogue into ordered work packages for Phase 2. §10–§12 cover risks, non-negotiables and the inputs only founders can supply.

Priorities:

| Priority | Meaning |
| --- | --- |
| **P0** | Blocks the Spain launch. Ship first. |
| **P1** | Part of the Spain launch quarter (Q4 2026 – Q1 2027). |
| **P2** | Europe expansion or post-launch scale (2027). |
| **P3** | Global or opportunistic (2028+). Specified now so earlier work does not block it. |

Effort: **S** ≤ 2 days · **M** ≤ 1 week · **L** ≤ 3 weeks · **XL** > 3 weeks (single agent, including verification).

---

## 1. Executive summary

**Where we are.** Caudals has built far more product than its funnel can reach. The evaluation engine on `app.caudals.com` (Stages A–E) is deployed: API, website-chatbot, uploaded-answer and private-runner connections; source-grounded test generation; deterministic and rubric-judge grading; reports with PDF/Word/CSV/CEF exports; sharing, comparisons, schedules, webhooks; expert assignments and signed improvement datasets; English and Spanish UI. The public site is polished, bilingual, with eight sector pages and strong SEO/GEO foundations.

**What stops us selling.** Almost nobody can get to that product:

1. The app is invite-only. The landing's main CTA ("Diagnóstico inicial gratuito") leads to a form and a 24-hour manual reply.
2. There is nothing a buyer can see before talking to us: no sample report, no demo, no published prices, no case study, no methodology page, no trust page.
3. We cannot measure the funnel. The analytics script points to a host that was removed, and form submissions are not handed to the outreach CRM automatically.
4. The customer journey has never been completed by a real nontechnical user (the Stage C release gate is still open). Test generation and judging run on quantized local models, and no commercial EU-processed model has been connected.
5. There is no commercial path after "yes": no proposal generator, no e-signature, and no invoicing set up for VeriFactu, which becomes mandatory for companies (sociedades) on 1 Jan 2027.

**The plan.** Product-led acquisition, founder-led sales:

- Turn the free Reality Check into a **self-serve Diagnóstico** on `app.caudals.com`: work email → our public assistant URL and docs → 40 cited questions → a preliminary report, human-checked before release during launch. This is the door that brings in "as many users as possible".
- Wrap it in **proof assets**: a sample report, the published methodology, a trust page, published prices, and the anonymized *Índice Caudals* sector studies.
- Convert through **readouts, proposals, the founding-customer offer and subscriptions**, all invoiced compliantly.
- Use the **regulatory calendar as timing, never fear**: Ley 10/2025 (human-escalation duties enforceable 28 Dec 2026), 2027 budget season, AI Act Annex III (2 Dec 2027).
- Expand **Spain → Portugal/Italy/France/DACH → LatAm Spanish and English markets**, on the same engine, adding native-language experts and localized packs.

**Proposed launch targets** (founders to confirm, §8): by 31 Mar 2027, 120 completed Diagnósticos, 12 paid pilots, 6 active subscriptions, 1 dataset build, gross margin ≥ 70% on subscriptions.

---

## 2. Current state (audit of 2026-10-08)

### 2.1 What exists and works

| Area | State | Evidence |
| --- | --- | --- |
| Evaluation engine | Stages A–E deployed on `app.caudals.com`, feature-gated where noted | `docs/evals/work-packages/WP-00`–`WP-15` status lines |
| Connections | API (OpenAI-compatible), website chatbot (per-site recipes, allowlisted), uploaded answers (CSV/XLSX/JSONL roundtrip), private runner (signed bundles) | WP-04, WP-09, WP-11, WP-12 |
| Generation | Extract → profile → plan → draft → validate → review → freeze, DGX by default; context questions; quarantine | WP-05; recent `fix(evals)` commits on reasoning budgets |
| Grading | Deterministic graders; calibrated rubric judge; human review queue; overrides as new assessments | WP-06 |
| Reports | Overview/Findings/Results/Improvements/Methodology, preliminary vs reviewed, narrative takeaways validated against metrics, PDF/Word/CSV/CEF, bearer and named shares with revocation, comparisons | WP-07, `lib/evals/reports/*` |
| Monitoring | Schedules, signed webhooks, CI integration endpoint | WP-13 |
| Experts and datasets | Expert profiles, redacted assignments, workbench, QA, signed improvement releases | WP-14, WP-15 (behind `EVALS_EXPERT_WORK_ENABLED`) |
| App UI | Platform design system, EN/ES catalog, command palette, notification centre, responsive inspector | `components/evals/*`, `lib/evals/messages/*` |
| Public site | Paper design, `/es` + `/en`, eight sector pages, contact intake → `evaluation_request`, Cal.com booking, `llms.txt`, markdown for agents, sitemaps, IndexNow | Live checks below |
| Operations | Daily encrypted backups, restore rehearsal, health alerts, runbooks, immutable image deploys | WP-08, `docs/evals/runbooks.md` |
| Growth stack | Caudals Ops (content, newsletter, Hermes prospecting) on `atlantic`; Warmbly cold outreach on `arctic` | `AGENTS.md`, `../leads/AGENTS.md` |

### 2.2 Live observations

Collected with headless Chromium against production and the local UI harness (`e2e/evals/harness-server.mjs`):

- `https://caudals.com/` → 307 to `/en` for a client with no language preference (by design); `/es` renders in ~0.1 s.
- `https://app.caudals.com/` → sign-in. A browser sending `Accept-Language: es-ES` is shown **English (US)**. The page says new users need a private invitation.
- `/es/contacto`, `/es/llamada` and `/es/legal/*` compute `font-family: ui-sans-serif, system-ui…` for their `h1`. `/es` and `/es/sectores/*` use Geist. DESIGN §13 requires Geist everywhere.
- The `/es/llamada` Cal.com embed shows the event title "Call" (English) and an unset time-zone selector ("Select…").
- `components/legal/site-analytics.tsx` loads `https://analytics.caudals.com/script.js`, but that route was removed (TOOLS.md). The site has no working web analytics.
- `content/blog/*` holds pre-pivot posts (active learning, multimodal datasets, contributor quality, RLHF data). They contradict current positioning; the blog is hidden from navigation but the posts are still routable.
- Workspace empty state: "Your Caudals operator will coordinate the first evaluation with you." That works for managed delivery; it has no self-serve start.
- The in-app "Help" button is a `mailto:` link.
- Marketing promises five failure causes (invented answer, outdated document, wrong source, knowledge gap, out of scope). Report findings carry only a free-text `cause_hypothesis` (`lib/evals/reports/contracts.ts`), so the product does not classify against that taxonomy.
- Pricing drift: `overview.md` sets prices and says "publish the pilot price on the website", while the site and `llms.txt` show the Pilot and Subscription as "Personalizado".

### 2.3 Gaps that block a market launch

| ID | Gap | Consequence |
| --- | --- | --- |
| G1 | No self-serve entry; invite-only app | Every lead waits for a founder; growth is capped by founder hours |
| G2 | No pre-sales proof (sample report, demo, methodology, prices, cases) | An unknown vendor asks for trust without showing anything |
| G3 | Stage C gate open: no nontechnical real user has completed the journey; second-device recovery unverified | Unknown failure modes in the first real deliveries |
| G4 | Generation and judging on quantized local models; no EU commercial provider key | Slow preparation (minutes per call) and unproven Spanish answer-key quality |
| G5 | No commercial back office (proposal, e-signature, invoicing, plan → entitlement) | Deals stall after "yes"; VeriFactu exposure from 2027 |
| G6 | Funnel is blind; no automatic lead hand-off | We cannot tell which channel works; slow speed-to-lead |
| G7 | Stale and off-positioning content | Hurts SEO trust and confuses visitors |
| G8 | No trust surface (DPA, sub-processors, security, retention) | Banks, insurers and health providers stall in procurement |
| G9 | Admin MFA optional; observability and object-storage stack status needs re-verification | Spec §16.1 requires platform-admin MFA before public self-service |

---

## 3. Strategy

### 3.1 Positioning (unchanged, sharpened)

> **"Sabemos si tu asistente de IA responde bien. Con pruebas."**
> The independent referee for business AI assistants: tests built from your own documents, answer keys signed by your experts, evidence a director can act on — then the data that fixes it.

Pillars to repeat everywhere: **independent** (we are not your vendor), **evidence-backed** (every verdict cites the page it comes from), **in your language** (Spanish first, written the way customers ask), **expert-signed** (practising professionals, not generic annotators), **yours** (you keep the test set).

What we are not: a developer evaluation SaaS, a certifier, an AI Act conformity assessor, a red-team shop, a generic labelling vendor.

### 3.2 Motion: product-led acquisition, founder-led sales

```
Visitor ─▶ Self-serve Diagnóstico (free, 40 Q) ─▶ Readout call ─▶ Pilot (€1,500 founding / €2,400)
   ▲                 │                                  │                 │
   │                 └─▶ "Not this quarter": €600 fix suite              ▼
Content, SEO,                                                   Subscription (€890 / €1,690 Plus)
Índice Caudals,     Outbound: operator-run Reality Check                  │
partners, events ─▶ on public assistants ─▶ private teaser ─▶ readout     ▼
                                                               Dataset build (from €8,000)
                                                               AI Act Evidence Pack (2027)
```

- **Self-serve does acquisition, people do monetization.** The free Diagnóstico should run without a founder until the readout. Paid work stays managed and expert-reviewed, as the overview says.
- **Outbound and inbound use the same artifact.** An operator-initiated Reality Check on a prospect's public assistant and a self-serve Diagnóstico produce the same report type.
- **Partners multiply reach.** Integrators and agencies that build assistants, and Kit Consulting accredited advisers, resell or refer us as the independent test layer.

### 3.3 Offer ladder (per `overview.md`; changes only through §4 decisions)

| Offer | Price | Self-serve? | Notes |
| --- | --- | --- | --- |
| Diagnóstico inicial (Reality Check) | Free | **Yes (new)** | 40 Q, public system, public docs, preliminary report; one per company domain |
| Suite de fallos | €600 | No | Fallback for "not this quarter" |
| Pilot Evaluation | €1,500 ×3 founding, then €2,400, then €3,200 after ten | No | 150–300 cases, expert session, reviewed report, readout |
| Full Evaluation | €4,900 | No | Two targets, side-by-side comparison ("Comparativa de proveedores") |
| Subscription | €890/mo; Plus €1,690/mo | No (P1), plan-managed | Monthly re-run, ~25 new cases/month, alerts; Plus: weekly, CI gate, escalation |
| Dataset Build | from €8,000 | No | Expert-built, provenance, re-run proof |
| AI Act Evidence Pack | €3,900 | No | 2027; evidence, never conformity |
| Monitor (self-serve SME plan) | Hypothesis €290–€390/mo | Yes | **Decision D-07**; P2, after unit economics are measured |

### 3.4 Timing hooks (use as timing, never fear)

- **Ley 10/2025 de servicios de atención a la clientela:** in force since 28 Dec 2025, obligations enforceable from **28 Dec 2026**. Customers can demand a human operator, and automated systems cannot be the only channel. Who is covered depends on company size and sector (basic services are covered regardless of size), so every message tells the prospect to check their own scope. Our angle: *"¿Tu asistente deriva a una persona cuando el cliente lo pide? Lo comprobamos con pruebas."* We test the behaviour; we never state that anyone complies.
- **2027 budget season** (Oct–Dec 2026): pilots signed now are paid from 2027 budgets.
- **EU AI Act Annex III high-risk obligations on 2 Dec 2027** (Digital Omnibus, per `overview.md`): "arrive with a year of run history".
- **VeriFactu for Caudals itself:** companies from 1 Jan 2027 (autónomos from 1 Jul 2027). This is our own back-office deadline (CO-02).

---

## 4. Decisions required before implementation

Each decision lists a recommendation. Items that depend on a decision say so.

| ID | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| **D-01** | Open self-serve signup for the free Diagnóstico | (a) keep invite-only; (b) open signup with work-email verification, caps and human QA before release | **(b).** It is the only way to reach "as many users as possible" without adding founder hours. It is for business owners, not a developer SaaS, so it stays inside `overview.md`'s out-of-scope line. |
| **D-02** | Publish prices on the website | (a) keep "Personalizado"; (b) publish a pricing page following `overview.md`'s published-price rules ("Pilot desde €2.400", founding €1.500 ×3, "Suscripción desde €890/mes", "Datasets desde €8.000") | **(b).** `overview.md` already requires it, and Spanish mid-market buyers self-qualify on price. |
| **D-03** | How customers pay | (a) invoices from a VeriFactu-compliant tool plus SEPA transfer or direct debit; (b) also Stripe Billing for card/SEPA subscriptions; (c) a merchant of record for global self-serve | **(a) now, (b) when Monitor (D-07) launches.** Marketplace code stays deleted either way. |
| **D-04** | Commercial model provider for generation and judging | EU-processed options: Mistral (EU), Azure OpenAI with EU data zone, AWS Bedrock in EU regions (e.g. Anthropic models), Google Vertex in EU regions | **Connect one EU-processed provider, under a DPA, as the default for `approved_providers` workspaces.** DGX stays for `local_only`. Pick the model with a measured bake-off on our Spanish gold set (EQ-01). |
| **D-05** | Release policy for self-serve reports | (a) auto-publish preliminary; (b) operator QA before release; (c) QA for the first N, then auto | **(c):** QA for the first 50 Diagnósticos or 8 weeks, whichever comes later; then auto-release when judge calibration passes and no critical item is disputed. |
| **D-06** | New public routes; some reuse deleted paths | Proposed `/pricing` (`/es/precios`), `/about` (`/es/sobre-nosotros`), `/trust` (`/es/confianza`), `/methodology` (`/es/metodologia`), `/experts` (`/es/expertos`), `/partners` (`/es/partners`), `/sample-report` (`/es/informe-ejemplo`), `/free-diagnostic` (`/es/diagnostico`) | **Approve.** `/pricing` and `/about` are on the deleted-marketplace list in AGENTS.md; approving MK-02/MK-05 explicitly authorizes reusing those paths with new, evaluation-only content. `/security` stays deleted (we use `/trust`); `/careers` stays deleted (we use `/experts`). |
| **D-07** | Self-serve Monitor plan for SMEs | (a) no; (b) build after 10 paying managed customers; (c) build now | **(b).** Spec it now (P2), build once Diagnóstico costs and conversion are measured. |
| **D-08** | Phase 2 execution protocol | Your Phase 2 instruction says to open a new Claude Code chat (Opus 5.5, high effort) and work on `main`. | **Choose one:** (a) implement in this session; (b) you open the new chat yourself and point it at this spec. Separately: the current branch is `codex/evals-generation-reliability`, with uncommitted edits to AGENTS.md, ARCHITECTURE.md, TOOLS.md and overview.md. Confirm whether to commit them to `main` first. |
| **D-09** | Índice Caudals publication policy | (a) don't publish; (b) publish anonymized sector aggregates from public-information snapshots only, after legal review | **(b).** Never include customer data, minimum 15 assistants per sector so no assistant can be identified, methodology published. |
| **D-10** | Language roadmap | — | **ES first** (app default for Spanish browsers, reports, emails). Co-official Catalan, Basque and Galician as **evaluation-content** packs (P1). PT-PT (P2), then FR/IT/DE (P2), LatAm Spanish variants (P3). |
| **D-11** | e-signature and invoicing vendors | e-signature: Signaturit (Spanish, eIDAS), Docuseal (self-hostable), others; invoicing: Holded, Quipu, Billin or similar VeriFactu-ready tools | **Founders pick based on cost and gestor preference;** integrations are thin (CO-01, CO-02). |
| **D-12** | Partner commercial terms | Referral fee vs reseller margin vs white-label | **Referral 15–20% of first-year revenue; white-label for certified partners at a 25–30% margin.** Founders to confirm. |

---

## 5. Feature catalogue

Each item: **ID · priority · effort — title**, then what, why and acceptance criteria (verified in Phase 2). "Exists" marks something already in the product that the item extends rather than rebuilds.

### 5.1 Self-serve acquisition (SS)

**SS-01 · P0 · L — Public "Diagnóstico gratuito" start page** (`/es/diagnostico`, `/en/free-diagnostic`)
- What: a short public page and form: the assistant's URL (or "it's not on the web"), up to five public documentation URLs or PDFs, work email, company, sector (preselected from the `sector` param), consent checkboxes (terms, testing authorization, privacy). Submitting creates the account request and sends a magic link. It replaces the current "Diagnóstico inicial gratuito" → `/contact?offer=reality-check` path. The form stays as the "talk to us" path.
- Why: today's highest-intent CTA ends in a 24-hour wait.
- Acceptance: page in ES/EN in the Paper language, with Turnstile or an equivalent challenge, rate limits and validation-message keys. Submission writes an `evaluation_request` with `offer=reality-check` plus a self-serve flag, an audit event and the lead hand-off (CO-04), then sends a magic link in the visitor's language. Lighthouse budget unchanged. Playwright covers happy path, invalid URL, a domain that already has a Diagnóstico, and rate limit.

**SS-02 · P0 · L — Self-serve account and workspace provisioning** (depends on D-01)
- What: Better Auth signup with email verification or magic link. Free webmail addresses are allowed but routed to operator approval. On first sign-in the app auto-provisions a workspace named after the company, with the `free_diagnostic` entitlement (SS-04), the owner role, Spanish locale for Spanish browsers, and accepted terms recorded with their version.
- Why: invitations cannot scale.
- Acceptance: a new user goes from email to an empty workspace in under 2 minutes. Terms, DPA and authorization acceptance are stored with versions and timestamps. Existing invitation flows are unchanged. Tenant isolation tests extend to self-provisioned workspaces. Admin MFA (PR-02) is enforced before this ships.

**SS-03 · P0 · M — Testing authorization and ownership check**
- What: before any call to a website target: (1) if the target's registrable domain matches the verified email domain, authorization is recorded automatically for ordinary questions; (2) otherwise the user attests and an operator approves, or the user verifies with a DNS TXT record or meta tag. Authorization is stored through the existing `projects/:id/authorizations` path and shown in the report's methodology. Adversarial packs are never available here.
- Why: AGENTS.md non-negotiables; it protects Caudals and the target.
- Acceptance: a run cannot start without a recorded authorization. A mismatched domain shows "Pending approval" in Spanish and appears in `/ops/review`. Automated tests cover domain match, subdomain, mismatch and verification-token paths.

**SS-04 · P0 · M — Free-tier entitlement, quotas and kill switches**
- What: an entitlement preset: 40 cases, 1 run, allowed connections `website`, `openai_compatible` and `imported_responses`, preliminary report only, machine-spend cap (initially €10, tuned from measurement), and one Diagnóstico per company domain per 12 months. Add a global daily spend ceiling and a `SELF_SERVE_ENABLED` kill switch. Exhausted quota shows an upgrade path, never an error.
- Acceptance: concurrency and budget-race tests prove caps hold under parallel signups. The kill switch hides SS-01 and blocks new free runs within one minute. The ops overview shows daily free spend.

**SS-05 · P0 · M — "Answer it yourself" in-browser answer collection** (extends the imported-answer path, which exists)
- What: for assistants we cannot reach (WhatsApp, in-app, voice transcripts, login-only), show the frozen questions one per card with a copy button. The user asks their assistant and pastes its answer. Autosave, progress ("23 de 40"), resume on another device, mobile-first. CSV/XLSX upload stays as the bulk path.
- Why: it makes "any assistant" true for nontechnical owners without per-site recipes.
- Acceptance: a 40-question set can be answered on a 390 px phone. Partial saves survive reload and a second device. Observations are labeled `customer_reported`. Duplicate and missing rows behave as the current import contract does. axe finds no serious violations.

**SS-06 · P0 · M — Diagnóstico report format** (a report template on the existing engine)
- What: the deliverable `overview.md` describes: score with denominator and interval; the five failure categories (EQ-06); seven annotated transcripts showing "Tu IA dijo / Lo correcto según tus documentos (cita)"; the coverage gaps found; and one page on what a pilot adds. A visible note: preliminary, public information only, evidence not certification.
- Acceptance: renders in web, PDF (ES/EN) and share views from one snapshot. Every transcript links to a result ID. The incomplete-coverage guard still applies. Fixture snapshot tests pass in both languages.

**SS-07 · P0 · S — In-app conversion path**
- What: on a ready Diagnóstico, the primary action is "Reserva tu sesión de resultados" (Cal.com embedded in the app, prefilled), with "Pide una propuesta de piloto" as the secondary action (creates a CO-01 draft). Upgrade prompts reference real findings ("12 preguntas no tienen respuesta en tu documentación → un piloto las cubre"); generic upsell copy is not used.
- Acceptance: booking and proposal events reach the funnel (AN-02) and the CRM (CO-04). There are no dark patterns; the report stays fully readable without booking.

**SS-08 · P1 · S — Invite your team, forward to your vendor**
- What: from the report, "Invitar a mi equipo" (viewer or editor invitations, which exist) and "Enviar a mi proveedor" (a named-recipient share with an explanatory note for the integrator). This is the viral loop inside the buyer's organization and its vendor.
- Acceptance: uses the existing share and invitation APIs. The recipient's landing explains what Caudals is and offers their own Diagnóstico.

### 5.2 Onboarding and activation (OB)

**OB-01 · P0 · M — First-run checklist**
- What: replace the passive empty state with a five-step checklist: Conecta tu asistente → Añade tus documentos → Revisa las preguntas (optional on free) → Ejecuta → Lee tu informe. Each step shows its state, one CTA and an approximate time. It collapses once complete.
- Acceptance: the state comes from real backend dimensions (`evaluation-stage.ts`), with no fake progress. Shown at 390, 768 and 1440 px. Harness contract added.

**OB-02 · P0 · M — Demo workspace and example evaluation**
- What: a synthetic, clearly labeled "Ejemplo" evaluation (e.g. an insurer's home-policy assistant), with a full reviewed-style report, failure causes, transcripts, a trend over three months and a comparison. It is visible read-only in every new workspace and reused as the public sample report (MK-03). Generated through the real engine from Caudals-owned synthetic documents so it never drifts from the product.
- Acceptance: labeled demo everywhere (UI badge, PDF watermark). Excluded from metrics, usage and billing. Regenerable by a script.

**OB-03 · P1 · L — Connection presets for common platforms**
- What: declarative mapping presets beyond OpenAI-compatible, for platforms Spanish companies use to build assistants (candidates to confirm by market research inside the work package: Azure OpenAI, AWS Bedrock Agents, Google Dialogflow CX, Microsoft Copilot Studio via Direct Line, Botpress, Voiceflow, Rasa, Landbot, Inbenta). Each preset asks only for endpoint, key and IDs; the generic HTTP mapping editor becomes available to customers as "Avanzado".
- Acceptance: each preset ships with a fixture test against a mock of its documented API and a connection check. No user-supplied code (spec §8.2). Unknown fields stay unknown.

**OB-04 · P1 · L — Website widget recipe library**
- What: validated declarative recipes for the most common chat widgets on Spanish corporate sites (to confirm by crawling a sample of target-ICP sites inside the work package). Detection picks the recipe automatically; unsupported widgets fall back to SS-05 with a friendly message.
- Acceptance: each recipe passes the two-message plus reset validation against a local fixture page that reproduces the widget's DOM. CAPTCHA, login walls and closed shadow roots still produce `needs_operator`, never a bypass.

**OB-05 · P1 · M — Better document intake**
- What: drag-and-drop of many files; "importar centro de ayuda" (bounded crawl of a help-centre URL or sitemap, which exists as website sources); scan/OCR detection with a clear ask; and a plain-Spanish "Lo que hemos entendido de tu asistente" summary of the context profile, which the user confirms or corrects in one screen.
- Acceptance: the limits in spec §9.1 are enforced and explained in plain language. Every confirmed field records customer provenance.

**OB-06 · P0 · M — Lifecycle emails (ES/EN)**
- What: welcome; "faltan documentos" nudge after 24 h; "preguntas listas"; "ejecución completada"; "informe listo"; readout reminder; D+7 follow-up; and, for subscribers, a monthly digest (MN-01). Sent through Resend and the notification outbox, with deduplication and an unsubscribe link for non-transactional mail.
- Acceptance: localized templates render in both languages with no English leakage in Spanish. Preference settings, which exist, are respected. Each message can be traced to its trigger event.

**OB-07 · P0 · M — In-app help centre**
- What: replace the `mailto:` Help button with a help drawer: short Spanish-first articles (connecting, documents, reading the report, evidence levels, privacy), a glossary (pass rate, coverage, interval, evidence level, preliminary vs reviewed), the published methodology (MK-06), and "Hablar con nosotros" (email, Cal.com, and a WhatsApp Business link if approved).
- Acceptance: content lives in message or content files, not hardcoded. Searchable from ⌘K. Every glossary term used in the report links to its definition.

**OB-08 · P2 · S — Contextual coach marks** on the first report only (three hints, dismissible, remembered per user).

### 5.3 Evaluation quality (EQ)

**EQ-01 · P0 · L — Production model strategy and bake-off** (depends on D-04)
- What: connect one EU-processed commercial provider under a DPA, through the existing provider/revision/price path. Build a **Spanish gold set** (≥ 120 human-reviewed items spanning grounded QA, numeric, escalation and out-of-scope cases across the eight sectors, Caudals-owned synthetic sources). Run a bake-off of generator and judge candidates (DGX models included) measuring agreement with human labels, cost and latency. Record the chosen routes and calibration in the methodology. DGX remains the route for `local_only` workspaces.
- Why: answer-key and judge quality is the product. A slow or wrong judge destroys trust in the first readout.
- Acceptance: judge agreement ≥ 85% on ordinary cases, with no unresolved critical disagreement and sample sizes reported (spec §11.3). Profile plus draft time for 40 cases is under 15 minutes p90. Costs come from the ledger. No silent fallback between providers (INV-11).

**EQ-02 · P0 · M — Spanish-first case writing**
- What: generation prompts and rubric templates tuned to how Spanish customers actually ask: tú and usted, typos, colloquial phrasing, regional vocabulary, multi-intent questions, numbers written as words, IVA-inclusive prices. Includes persona variation and temporal cases ("¿y si lo contrato el mes que viene?").
- Acceptance: a native reviewer rates a 50-case sample ≥ 4/5 on naturalness, with no translated-from-English artifacts. A regression test pins prompt revisions.

**EQ-03 · P1 · L — Eight sector domain packs, one template**
- What: versioned packs for insurance, industrial after-sales, health, banking, energy, telecom, law/advisory and travel, built to one template: task taxonomy, required context fields, rubric templates, prohibited assumptions, deterministic checks (amounts, dates, codes), review guidelines and a starter sector-generic library (≥ 60 Caudals-owned cases per sector from public sources, tagged `sector_generic`). All packs reach the same minimum bar; depth follows demand.
- Acceptance: packs load through the existing domain-pack library. Every sector-generic item records its public source and rights. Customer-specific items never enter a pack (overview rule).

**EQ-04 · P0 · M — Cross-sector "customer rights and escalation" pack (Spain)**
- What: evidence tests for behaviour that consumer-facing assistants commonly get wrong: offering a human on request (Ley 10/2025 hook), complaint routes, withdrawal periods, warranty, data-protection requests, price transparency, and not giving advice outside scope. The report wording is "observamos que…", never "cumple" or "no cumple".
- Acceptance: legal review of the case texts before release. Report copy is checked by a test that rejects the words *cumple*, *certifica*, *conforme* and their English equivalents in generated narrative.

**EQ-05 · P1 · L — Expert session and answer-key sign-off**
- What: a structured 90-minute expert-session template (agenda, disputed items, definitions of "correct") in `/ops`. The customer's expert reviews the answer key in the app and signs it ("Firmo esta clave de respuestas": name, role, timestamp, suite content hash). Evidence level is raised to `expert_adjudicated` for the signed cases. A customer can dispute an item, which goes to adjudication.
- Acceptance: the signature is immutable and bound to the suite version hash. The report shows "Clave firmada por <rol> el <fecha>" with the coverage count. Editing a signed case creates a new unsigned revision.

**EQ-06 · P0 · M — Five-cause failure taxonomy in the product**
- What: classify every failed or partial result into the five causes the site promises (invented answer, outdated document, wrong source, knowledge gap, out of scope), plus `other` and `unknown`. The classification is a judge criterion with review override. It is labeled observed or hypothesis according to spec §11.6 (traces vs no traces), aggregated in findings and reports, and drives the fix pack (RP-03).
- Acceptance: added to the CEF assessment extension and the report snapshot without breaking schema 1.0 (a namespaced extension). The per-cause count reconciles with the failure count. Copy matches the marketing names in both languages.

**EQ-07 · P1 · M — Consistency and robustness checks**
- What: paraphrase families (same intent, three wordings), typo variants, and a repeated-run instability subset (spec §11.5). Results are reported as "consistencia".
- Acceptance: family-level aggregation with seeded resampling. Never counted as extra independent cases.

**EQ-08 · P1 · M — Co-official and multilingual content packs**
- What: case generation and grading in Catalan, Basque, Galician and English, plus language-handling tests ("¿Me lo puedes explicar en catalán?").
- Acceptance: a native reviewer for each language validates a 30-case sample before the pack is enabled. The UI language and the dataset language stay separate fields.

**EQ-09 · P1 · L — Customer log mining**
- What: upload anonymized conversation logs (CSV/JSONL). PII is redacted at ingest. Real questions are clustered and the most frequent and riskiest intents are proposed as cases, with frequency shown ("el 8% de tus conversaciones preguntan por la permanencia").
- Acceptance: redaction is applied before any model call. Originals are retained only per the engagement policy. Every proposed case links back to its anonymized cluster.

**EQ-10 · P1 · M — Monthly additions pipeline (~25 cases/month/customer)**
- What: an operator queue that combines mined questions, expert-authored cases and failure-driven variants, has an SLA date per customer and a target count, and freezes a new suite version before the monthly run.
- Acceptance: the monthly report shows "N preguntas nuevas este mes" and their provenance. A missed SLA alerts operators.

### 5.4 Reports and readout (RP)

**RP-01 · P0 · M — Executive summary page**
- What: a one-page director view leading every report: a verdict sentence, the score with its interval and denominator, the three most consequential failures (qualitative consequence), the three first fixes, the coverage note and the evidence level.
- Acceptance: every statement traces to findings or results (the existing validation). Readable on a phone. Appears first in web, PDF and Word.

**RP-02 · P1 · M — Readout (presentation) mode**
- What: a full-screen, slide-like walk-through of a report revision for the live session: cover, verdict, causes, five to seven transcripts, fixes, next steps (pilot or subscription). Keyboard navigation, presenter notes for the operator, export to PDF.
- Acceptance: uses the same snapshot, so there is no live-query drift. Works on a 1280×720 shared screen. Shared-view redaction rules apply.

**RP-03 · P1 · L — Fix pack**
- What: for each finding, concrete remediation drafts: a missing knowledge-base article, a corrected FAQ entry, a policy or instruction snippet for the assistant, an escalation rule. Drafts are labeled hypothesis, exportable as DOCX or Markdown, and expert-reviewed on paid tiers. It feeds Dataset Build scoping.
- Acceptance: each draft cites the finding and source anchors. Drafts never claim the fix works until a re-run comparison shows it (RP-05).

**RP-04 · P1 · M — Exposure estimator (opt-in)**
- What: the customer enters monthly conversations, the share of them on the affected topic, and the cost per wrong answer (or picks sector presets with stated assumptions). The output is a range with the formula and a sensitivity table. The estimator never runs without customer-supplied inputs (spec §15.2).
- Acceptance: the formula is shown and assumptions are editable. The section is excluded from shares unless included explicitly. No headline number appears without the assumptions next to it.

**RP-05 · P1 · M — Live improvement tracker**
- What: improvements become tasks that live outside the immutable report snapshot: owner, status, due date and comments. A later comparison marks a task "verificado" when the linked cases flip from fail to pass on matched revisions.
- Acceptance: snapshots stay immutable. Tracker state is versioned and audited. "Verified" requires a comparable paired re-run (spec §11.5).

**RP-06 · P1 · M — Subscriber trend dashboard**
- What: score over time with intervals, regressions per run, cause mix over time, coverage growth (150 → 300), and cases added per month. One chart per question, following `dataviz` rules and the platform tokens.
- Acceptance: unmatched suite versions are never plotted as a direct delta (spec §11.5); scope changes are annotated. An accessible table is available for every chart.

**RP-07 · P1 · M — PDF polish and white-label**
- What: cover, table of contents, page numbers, Spanish typography, report ID and content hash on every page footer, and the "evidencia, no certificación" note. Partners can add their logo next to Caudals' (PT-01).
- Acceptance: text is selectable, page breaks are controlled, and there is no overflow on the longest fixture. Golden-image tests run in ES and EN.

**RP-08 · P2 · M — Comments and disputes on findings**
- What: threaded comments on findings and results between the customer and Caudals, with mentions and resolve. "Disputar este resultado" creates a review-queue item.
- Acceptance: comments never alter assessments; disputes create attributed reviews. Email notification follows preferences.

**RP-09 · P1 · S — Consent-gated case study workflow**
- What: from a published report, an operator drafts a case study (before/after metrics, quotes). A recorded written-consent artifact is required before anything leaves the workspace (INV-13). The approved case study feeds MK-07.
- Acceptance: the publish button is disabled until a consent record with document and signer exists. An audit event is written.

### 5.5 Subscription and monitoring (MN)

**MN-01 · P1 · L — Monthly cycle automation**
- What: per subscriber: freeze the monthly additions (EQ-10) → scheduled run (schedules exist) → diff report vs last month → a Spanish "Qué ha cambiado este mes" digest email → a quarterly-review agenda generated from the trends.
- Acceptance: one schedule drives the whole cycle. A failure at any step alerts operators and the customer sees a truthful status. The digest numbers come from the comparison snapshot.

**MN-02 · P1 · M — Slack and Microsoft Teams alerts**
- What: incoming-webhook destinations for regressions, critical failures, connection failures and report readiness, alongside email and signed webhooks (which exist). Thresholds are configurable per workspace.
- Acceptance: secrets are write-only. Deliveries are deduplicated by event ID. Test-send buttons are provided.

**MN-03 · P2 · M — Change-triggered runs**
- What: re-run on vendor or model change (the CI webhook exists for Plus) and on documentation change (a weekly bounded re-crawl detects changed help-centre pages and queues targeted cases).
- Acceptance: triggered runs respect entitlements and budget. Each report states its trigger.

**MN-04 · P2 · M — Daily canary for Plus**
- What: five fixed questions per day catch outages and silent model swaps between full runs, at a cost-bounded rate.
- Acceptance: canary results never mix into the monthly score. Three consecutive failures send an alert.

**MN-05 · P0 · M — Plans mapped to entitlements**
- What: plan records (Free, Pilot, Esencial, Plus, Enterprise, Partner) set entitlements automatically when an operator assigns a plan (from a signed proposal, CO-01). Runtime users can never raise limits (existing rule).
- Acceptance: changing a plan writes an audit event and updates entitlements atomically. A downgrade never deletes data.

### 5.6 Commercial operations (CO)

**CO-01 · P0 · M — Proposal generator and e-signature** (depends on D-11)
- What: in `/ops`, generate a Spanish or English proposal PDF from the request and the Diagnóstico: scope, fixed price per the published price steps, timeline, 50/50 billing, the pilot-credit rule, the founding-offer obligations when applicable, and testing authorization. Send it for e-signature. On signature: assign the plan (MN-05), create or upgrade the workspace, and notify founders.
- Acceptance: prices come from one configuration source shared with the pricing page and `llms.txt`. The signed PDF and its hash are stored privately. The proposal → signature → plan transition is audited.

**CO-02 · P0 · M — Invoicing and payment tracking** (depends on D-03, D-11)
- What: invoices are issued from a VeriFactu-ready tool (founders' choice), linked to the workspace and the proposal through its API or a manual reference: 50% on signature, 50% on delivery, subscriptions monthly in advance. Track paid, overdue and reminders. Credit the pilot against a dataset build signed within 60 days.
- Acceptance: no invoice math duplicated in our code. An overdue invoice raises an ops alert. VeriFactu compliance comes from the tool, in place before 1 Jan 2027.

**CO-03 · P1 · S — Founding-customer program tracker**
- What: three slots at €1,500, each with its obligations (named case study, a 20-minute recorded conversation, two peer introductions) tracked to completion.
- Acceptance: the slot counter is visible in ops. The fourth pilot is quoted at €2,400 automatically.

**CO-04 · P0 · M — Lead hand-off and speed-to-lead**
- What: every contact form, self-serve signup, Diagnóstico completion, readout booking and proposal event is pushed to the outreach CRM (Warmbly on `arctic`, or Caudals Ops, per that system's API) with UTM and attribution. Founders get an instant alert (email plus Slack or Telegram) and the lead gets a Spanish auto-acknowledgement with a Cal.com link. Lead score from sector, company size, system type and stage.
- Acceptance: the hand-off goes through an outbox, so it is idempotent and replayable. No newsletter/outreach list merging (Leads rule 5). A founder alert arrives within 60 seconds of submission. Read `../leads/AGENTS.md` and the Warmbly contract before implementation.

**CO-05 · P1 · M — Customer economics dashboard**
- What: per workspace: revenue (from invoices), machine spend (ledger), expert hours and payouts (EX-05), gross margin, and runs/cases per month.
- Acceptance: platform-admin only. Numbers reconcile with the ledger and invoices.

**CO-06 · P1 · S — Kit Consulting and partner referral tracking**
- What: a referral source on opportunities (partner or accredited adviser), subcontract templates for adviser-led engagements, and commission accrual (manual payout).
- Acceptance: referral attribution survives the CRM round-trip. Commission is reported per quarter.

### 5.7 Expert network (EX)

**EX-01 · P1 · M — Public expert recruitment page** (`/es/expertos`; depends on D-06)
- What: who we seek (practising or recently retired professionals per sector), how the work runs, pay range (€30–€60/h equivalent), confidentiality, and per-deliverable engagement. The application form collects credentials, sector, languages and availability, and feeds an applicant pipeline in `/ops/experts`.
- Acceptance: the form follows the quiet form treatment with rate limits. Applicant data is minimized; retention is defined in the privacy policy.

**EX-02 · P1 · M — Vetting by paid trial task**
- What: auto-assign a trial task with gold items to each shortlisted applicant. Agreement is scored, and above the threshold the applicant joins the roster.
- Acceptance: uses the existing assignment, QA and gold-item machinery. The decision is recorded with a reason.

**EX-03 · P1 · S — Expert contracts by e-signature**
- What: a freelance services agreement with IP assignment (to Caudals for sector-generic work, to the customer for customer-specific work), confidentiality and data-processing terms, e-signed and stored per expert. Engagement is per deliverable, with false-self-employment safeguards.
- Acceptance: no assignment to customer material is possible without a signed, current agreement (enforced server-side).

**EX-04 · P1 · M — Guidelines library and onboarding**
- What: versioned guidelines per task type and sector, worked examples and a short qualification quiz.
- Acceptance: each submission records its guideline version (exists). A guideline change requires re-acknowledgement.

**EX-05 · P1 · S — Expert statements**
- What: accepted items roll into a monthly statement; the expert invoices manually. Automated payouts stay out of scope (spec §18).
- Acceptance: statement totals reconcile with accepted items.

**EX-06 · P2 · M — Expert quality dashboard**: agreement, gold accuracy, rework rate and throughput per expert and sector, with sample sizes.

### 5.8 Marketing site and content (MK)

**MK-01 · P0 · S — Polish fixes**: see §6 (fonts, Cal.com, analytics, blog, cookie banner).

**MK-02 · P0 · M — Pricing page** (`/es/precios`, `/en/pricing`; depends on D-02 and D-06)
- What: the offer ladder from §3.3 in the Paper language, with the Diagnóstico as primary CTA, "desde" prices, what is included, the commercial rules a buyer needs (fixed price, 50/50, cancellable in the first 90 days, pilot credit), and a short FAQ.
- Acceptance: prices read from `lib/public/evaluation-offers.ts` and the messages. `llms.txt`, agent markdown and structured data stay consistent (one source of truth). FRONTEND.md and DESIGN.md §13 are updated, since the landing still shows no pricing section.

**MK-03 · P0 · M — Sample report** (`/es/informe-ejemplo`)
- What: the OB-02 demo report as an interactive public page plus a downloadable PDF. The download is soft-gated (optional email, never required).
- Acceptance: labeled synthetic. Uses public-safe share projections. Linked from the landing step 4 ("Lo que recibes"), the pricing page and outbound emails.

**MK-04 · P0 · M — Trust page** (`/es/confianza`, `/en/trust`)
- What: how we handle data (routing per workspace: `local_only` vs approved providers; no "EU-only" claim unless true), sub-processors, retention defaults (spec §16.4), encryption and access controls, backups and recovery, responsible testing (ordinary questions only on public systems, no adversarial testing without written authorization), the DPA download, security contact, and "evidencia, no certificación".
- Acceptance: every claim maps to a verified control (PR-06 checklist). Legal review before publish. Linked from the footer, pricing and the app's settings.

**MK-05 · P1 · S — About page** (`/es/sobre-nosotros`; depends on D-06): team, Valladolid, supporters (the existing partner logos), the why, contact.

**MK-06 · P0 · M — Published methodology** (`/es/metodologia`)
- What: how cases are built, evidence levels, the five causes, scoring and denominators, intervals, review coverage, limitations, and what a preliminary report means. Versioned, with a change log.
- Why: AGENTS.md "favour what compounds: the published methodology". It is the credibility anchor for buyers, journalists and AI search.
- Acceptance: matches the engine's actual definitions (spec §11.4). Changes ship with the version that changes them. In `llms.txt`.

**MK-07 · P1 · S — Case studies section**: template ready; filled only from RP-09 consented studies; an empty section is not shown.

**MK-08 · P0 · M — Blog reset and relaunch**
- What: unpublish or `noindex` the pre-pivot posts (or rewrite the two or three that can be re-angled). Re-enable the blog in navigation once there are ≥ 6 evaluation-focused Spanish posts. Editorial calendar: two posts a week through the Ops Content Suite publishing contract (`content-publishing-contract.md`). Pillars: failure examples by sector (anonymized), how to test an assistant, Ley 10/2025 and escalation, evaluation vs vendor testing, methodology notes, AI Act timing.
- Acceptance: no removed post returns 200 without `noindex` (or it redirects or returns 410, by decision). Sitemaps updated. IndexNow run after deploy (exists).

**MK-09 · P1 · S — Newsletter relaunch**: re-enable *The Data Gap* in navigation with an evaluation focus and monthly cadence ("la pregunta trampa del mes", CF-02). Double opt-in exists.

**MK-10 · P1 · M — Partners page** (`/es/partners`): for integrators, agencies and Kit Consulting advisers: the independent test layer, white-label reports, referral terms (D-12), the partner kit (PT-02), and an application form.

**MK-11 · P0 · M — Landing conversion pass**
- What: point the hero CTA to SS-01. Add a "Ver un informe de ejemplo" secondary link. Add a customer-logo slot (only with consent). Step 4 links to the sample report. Pricing link in the nav. A **Ley 10/2025 campaign page** (`/es/atencion-a-la-clientela-ia`) explains, in plain language, which behaviour we test (human escalation, complaint routes) and offers the Diagnóstico.
- Acceptance: CTA click-through is measured (AN-02). The campaign page passes the claims test (no compliance wording) and carries a "consulta tu asesor" note on scope.

**MK-12 · P1 · L — Índice Caudals (anonymized sector studies)** (depends on D-09)
- What: quarterly studies of ≥ 15 public Spanish assistants per sector, using ordinary questions and public documentation only, under the existing third-party rules (spec §16.5). Published as aggregates ("el 38% inventó una comisión") with methodology. No names, no screenshots that identify anyone. Delivered as a gated PDF, a press release and LinkedIn carousels, with an outreach hook ("tu sector, de media…").
- Acceptance: legal review per edition. An identifiability check (no single-assistant facts). Every number traces to stored runs. Named results for any assistant go only to its owner, privately.

**MK-13 · P1 · M — Lead magnets and tools**: an exposure calculator (public version of RP-04 with sector presets), the checklist "¿Está listo tu asistente para clientes?", and a Spanish question-template pack per sector (downloadable, lightly gated).

**MK-14 · P1 · M — SEO/GEO content structure**: Spanish keyword clusters (evaluación de chatbots, auditoría de asistentes de IA, pruebas de chatbot, alucinaciones de IA en empresas, asistente de IA atención al cliente), sector × problem pages, a glossary, `FAQPage` and `HowTo` data where truthful, and internal linking. Measure in Search Console.

**MK-15 · P2 · L — European locales for marketing** (PT, then FR/IT/DE): routing, messages, sector pages, legal pages, `hreflang` (`lib/i18n/routing.ts` is ready for more locales).

**MK-16 · P1 · M — Explainer and demo videos**: a 90-second explainer and a 3-minute product walk-through in Spanish (with English subtitles), for the landing, LinkedIn and outbound. Can be produced with the HyperFrames tooling available to this workspace.

### 5.9 Analytics and growth instrumentation (AN)

**AN-01 · P0 · S — Restore web analytics**
- What: serve the Umami script and collector through a first-party path on `caudals.com`, proxied privately to the internal Umami (the dashboard stays Tailscale-only), loaded only after analytics consent. Alternatively remove it and rely on AN-02 alone. Recommend the proxy. Update the CSP.
- Acceptance: no console errors from dead scripts. Page views appear in Umami after consent and none appear without it. No third-party domains are added.

**AN-02 · P0 · M — End-to-end funnel events**
- What: first-party events (`/api/analytics/track`, which exists, plus app events) for: visit → CTA → Diagnóstico start → verified signup → system connected → docs added → run complete → report viewed → readout booked → proposal sent → signed → subscription. No PII in events, only opaque journey IDs (the Leads `/r/` attribution contract). Add a weekly funnel view in `/ops`.
- Acceptance: each step is visible with counts and conversion per channel. Events are deduplicated. Spot-check reconciliation with the CRM.

**AN-03 · P1 · M — Product health metrics**: activation (signup → report within 7 days), time to first report, report re-views, share creation, retention of subscribers' logins. Aggregates only.

**AN-04 · P1 · S — Attribution through to revenue**: UTM, `/r/` short links and Warmbly campaign IDs carried onto the opportunity and the signed proposal (CO-01).

**AN-05 · P1 · S — NPS after readout and in-app feedback**: one question with an optional comment, sent once after the readout; a feedback link in the help drawer.

### 5.10 Platform readiness, trust and security (PR)

**PR-01 · P0 · M — Close the Stage C release gate with a real user**
- What: a founding customer or a friendly nontechnical tester completes source → live target → execution → grading → reviewed report → restricted share, including in-progress recovery on a second device. Fix what breaks.
- Acceptance: evidence recorded in WP-11 per its rules (no customer data in docs). Defects fixed and regression-tested.

**PR-02 · P0 · S — Mandatory MFA for platform admins and operators**
- What: enforce TOTP or passkey (both exist) for platform-admin and operator roles before SS-02 ships. Customer accounts get optional MFA, and owners can require it for their workspace.
- Acceptance: a sensitive action without a recent MFA session is refused. Recovery runbook updated. `/admin` behaviour is preserved apart from the MFA requirement.

**PR-03 · P0 · M — Monitoring, uptime and status page**
- What: re-verify and redeploy the observability stack if it is still down (TOOLS.md, 2026-09-11 note). Add external uptime checks for `caudals.com`, `app.caudals.com`, sign-in, the share gateway and the run queue age, plus a public status page (`status.caudals.com`), hosted off the primary node (e.g. on `arctic`).
- Acceptance: alerts reach founders. The status page reflects real checks. The completion gate (`platform:completion-status`) passes or has documented waivers.

**PR-04 · P0 · M — Self-serve load and cost rehearsal**
- What: simulate 50 concurrent Diagnósticos against fixture targets. Verify queue fairness, budget caps, DGX saturation behaviour (a recorded plan change or a wait, never a silent fallback) and app latency targets (spec §2.3).
- Acceptance: a report with p50/p95 timings and cost per Diagnóstico. Caps hold. Measured numbers feed SS-04 and D-07.

**PR-05 · P0 · M — Security pass before open signup**
- What: a targeted review of signup, provisioning, authorization and share flows (`/security-review`), dependency and image scans (exist), and an external penetration test on the self-serve surface (the quarterly tracker exists).
- Acceptance: no open high or critical findings at launch. Findings tracked to closure.

**PR-06 · P0 · M — Legal pack**
- What: platform terms (Condiciones del servicio), DPA (encargo de tratamiento, art. 28 GDPR) with a sub-processor list, an acceptable-use and testing-authorization policy, a privacy-policy update for app users and experts, a cookie-policy update for AN-01, the record of processing activities, and a DPIA for evaluation data. Drafts are prepared by us; **qualified legal review is required before publication** (spec §16.4).
- Acceptance: versioned documents, accepted in SS-02, downloadable from MK-04. The privacy policy names actual sub-processors.

**PR-07 · P1 · S — Support process**: a support inbox with SLA per plan (Free: best effort; Pilot/Esencial: 1 business day; Plus: 4 business hours), a founder on-call rota for P1 incidents, and an incident template linked to the existing runbooks.

**PR-08 · P2 · L — Certification roadmap**: ENS (Esquema Nacional de Seguridad, for the public sector) and ISO/IEC 27001 readiness for banks and insurers. Start with a gap assessment and a policy set. Note the distinction: these certify **Caudals' own security**, never customers' AI systems.

### 5.11 App UX polish (UX)

**UX-01 · P0 · S — Spanish by default for Spanish users**: negotiate the app locale from `Accept-Language` when no `caudals_locale` cookie exists (app-host only; marketing negotiation unchanged). Emails and exports follow the person's locale. `/admin` stays English.

**UX-02 · P0 · M — Plain-language pass on customer screens**: replace engine vocabulary on customer surfaces ("Strict pass rate" → "Respuestas correctas"; "Assessed coverage" → "Preguntas evaluadas"; "Eligible" → "En alcance"). Each keeps a tooltip with the exact definition (OB-07 glossary). Operators keep technical terms. A native Spanish copy review of the whole `es.ts`.

**UX-03 · P0 · S — Evaluations list that tells you something**: show the latest score with denominator, a trend arrow vs the previous comparable run, relative "updated" time and the next action ("Sube tus respuestas", "Revisa las preguntas"). Verify against production data; the harness fixture showed "—" in these columns.

**UX-04 · P1 · M — Honest progress**: a "what is happening now" sentence, an ETA range only after observed throughput (spec §5.2), a prominent notify-me toggle, and an elapsed-time display.

**UX-05 · P1 · M — Question review for customers**: bulk approve, filter by topic and severity, side-by-side source excerpt, keyboard shortcuts (J/K/A/E), "Aprobar las revisadas".

**UX-06 · P0 · S — Result detail mirrors the marketing promise**: the result inspector leads with "Tu IA dijo" vs "Lo correcto según tus documentos", the source title and anchor, the highlighted excerpt and the cause badge (EQ-06), exactly as on the landing's step 2.

**UX-07 · P1 · S — Mobile report**: the executive summary first, collapsible sections, readable tables.

**UX-08 · P0 · M — Accessibility audit**: axe checks in the Playwright UI harness on every customer screen; fix all serious and critical issues (WCAG 2.2 AA target, DESIGN §11).

**UX-09 · P1 · S — Consistent empty and error states**: one icon, title, line and CTA per DESIGN §9; Spanish recovery copy reviewed.

**UX-10 · P3 · M — Dark mode**: the tokens are authored; enable and QA every screen (DESIGN §5).

### 5.12 Partners and channel (PT)

**PT-01 · P2 · L — Partner workspaces**: a partner organization manages several client workspaces (a `partner` role scoped to its clients only), co-branded or white-label reports (RP-07), referral attribution and commission reports.
- Acceptance: a partner can never see a client it was not granted. Each client keeps its own data boundary and consent rules.

**PT-02 · P1 · S — Partner kit**: a deck, a one-pager, a demo workspace (OB-02) and talk tracks.

**PT-03 · P1 · M — "Comparativa de proveedores" (vendor bake-off)**: productize the Full Evaluation's two-target comparison for companies choosing or renewing an assistant vendor: the same frozen suite against two to four candidates, with a side-by-side report for procurement. Comparisons exist; this adds the template, multi-target setup and report layout.
- Acceptance: paired comparison rules (spec §11.5). Candidate identity is blinded to the judge. Results stay private to the buyer; vendors see only what the buyer shares.

### 5.13 Internationalization and expansion (IN)

**IN-01 · P1 — Spain**: ES default (UX-01) and co-official language content (EQ-08).

**IN-02 · P2 · L — Portugal (PT-PT)**: marketing locale, app catalog, report i18n, sector pages adapted to Portuguese regulators and terms, and a native expert roster.

**IN-03 · P2 · XL — France, Italy, DACH**: one country at a time. Each needs a marketing locale, an app and report catalog, local consumer-service rules researched (no copy-paste of the Spanish hooks), a native expert roster (5–15 per active sector, per the overview), local legal pages and partner recruitment.

**IN-04 · P3 · M — LatAm Spanish**: es-MX/es-CO/es-CL variants in generation (vocabulary, currency, regulation as dates and sources), USD price display, and readouts by time zone.

**IN-05 · P3 · M — English-language markets**: English packs, GBP/USD, and VAT invoicing handled by the invoicing tool (EU B2B reverse charge).

### 5.14 Differentiating features (CF)

**CF-01 · P1 · S — "La pregunta trampa del mes"**: one real-looking, anonymized question that many assistants in a sector get wrong, published monthly (newsletter, LinkedIn, blog). Sourced from Índice runs; no names.

**CF-02 · P2 · M — Event kiosk mode**: a booth demo at conferences. A visitor enters their public assistant URL and gets ten ordinary questions and a mini-score in about five minutes, under the same authorization rules (SS-03); full results arrive privately by email.

**CF-03 · P1 · S — "Tu examen es tuyo" interop exports**: alongside CEF/JSONL/CSV (which exist), export the golden set in formats popular developer evaluation tools import (to confirm per tool: promptfoo YAML, Langfuse/Braintrust dataset JSON). Positions us as complementary to the customer's engineering tools.

**CF-04 · P1 · S — CI gate quickstart**: a documented GitHub Actions and GitLab CI snippet for Plus customers' vendors, using the existing CI integration endpoint and signed tokens.

**CF-05 · P2 · L — AI Act Evidence Pack generator (2027)**: assembles run history, methodology, versions, review coverage and changes into supporting documentation organized around Articles 10 and 15 themes. Titled and worded as evidence, never conformity (AGENTS.md non-negotiable). Pairs with the €3,900 offer.

**CF-06 · P2 · M — "Pregunta a tu informe"**: an in-app assistant that answers questions about a report using only that report's snapshot, citing result IDs and refusing anything outside it. Bounded model job, ledger-accounted.

**CF-07 · P1 · S — Expert-signed seal**: reports with expert-signed answer keys (EQ-05) show a verifiable seal (signer role, date, suite hash), checkable on a public verification URL that reveals no content.

**CF-08 · P2 · M — Voice and IVR via transcripts**: evaluate voice agents from text transcripts (import or SS-05). Audio itself stays out of scope (frozen modalities).

**CF-09 · P3 · L — Open evaluation environment**: per the overview's months 5–6 idea, one public Spanish customer-service evaluation environment as a portfolio piece, built only from Caudals-owned synthetic material.

---

## 6. Polish defects found in the audit

| ID | Priority | Defect | Fix | Verification |
| --- | --- | --- | --- | --- |
| PO-01 | P0 | `/es/contacto`, `/es/llamada`, `/es/legal/*` (and EN equivalents) use the system font, not Geist | Apply `font-mk-sans` (or the landing-shell font scope) to the funnel and legal page shells | Computed-font check in Playwright for every public route |
| PO-02 | P0 | Cal.com event titled "Call" (English) on Spanish pages; time zone shows "Select…" | Rename the events per locale ("Llamada de 30 minutos con Caudals"), pass locale and time-zone defaults to the embed, consider separate ES/EN event types | Visual check ES/EN, desktop and mobile |
| PO-03 | P0 | Dead analytics script `analytics.caudals.com/script.js` | AN-01 | No console errors; consent-gated views recorded |
| PO-04 | P0 | Pre-pivot blog posts still routable | MK-08 | Old URLs `noindex`, redirect or 410; sitemaps clean |
| PO-05 | P0 | App defaults to English for Spanish browsers | UX-01 | `Accept-Language: es-ES` → Spanish sign-in |
| PO-06 | P0 | Pricing drift between `overview.md` and the site, `llms.txt` and structured data | MK-02 with one price source | One config; grep finds no stray price strings |
| PO-07 | P1 | Passive workspace empty state | OB-01 | Harness contract |
| PO-08 | P1 | Help is a `mailto:` link | OB-07 | Help drawer contract |
| PO-09 | P1 | The cookie banner covers the hero conversation on mobile on first visit | Compact bottom bar on small screens; keep equal-weight Accept/Reject (AEPD guidance) | 390 px screenshot |
| PO-10 | P1 | Landing step sections are invisible until their scroll entrance runs (blank in full-page captures) | Make the visible state the default with no JS, and animate only when JS and motion are allowed | Screenshot with JS disabled shows all steps |
| PO-11 | P1 | `/contact` promises "contestaremos en 24 horas" with no SLA tooling | CO-04 alerts plus auto-acknowledgement | Founder alert under 60 s; auto-ack email received |
| PO-12 | P2 | Five-cause taxonomy on marketing but not in the product | EQ-06 | Report shows per-cause counts |

---

## 7. Go-to-market plan

### 7.1 Phase 1 — Spain (Oct 2026 → Mar 2027)

**ICP** (per `overview.md`): Spanish companies with 50–500 employees that launched a customer-facing or internal AI assistant in the last 18 months, where the owner cannot currently prove it answers correctly. Qualify on consequence (money, rights, safety), not on whether an assistant exists. Buyer roles: Atención al Cliente, Transformación Digital, Canal Digital, Postventa/Servicio Técnico, Calidad, Operaciones.

**Channels, in order of expected yield:**

1. **Outbound Reality Check** (Hermes prospecting → Warmbly on `arctic`)
   - Each week, qualify 20–30 public assistants from the ICP. Run an operator Reality Check (ordinary questions, public information, conservative traffic, spec §16.5). Send a private, personalized teaser to the system owner: "Le hicimos 40 preguntas a vuestro asistente; 7 respuestas contradicen vuestras condiciones. ¿Os enseño cuáles en 20 minutos?". Follow with a readout, then a proposal.
   - Guardrails: never public, never named elsewhere, no adversarial content. Outreach describes the evidence scope accurately (spec §16.5).
2. **Inbound self-serve**
   - The Diagnóstico (SS-01) is the CTA everywhere: landing, sector pages, blog, newsletter, LinkedIn.
   - Founder-led LinkedIn: three posts a week (failure examples, methodology, the monthly trap question).
   - Spanish SEO (MK-14).
   - The Ley 10/2025 campaign page (MK-11), launched now, before the 28 Dec 2026 enforcement date.
3. **Partners** (MK-10, PT-02)
   - Recruit 10 Spanish AI integrators and agencies as referral partners in Q4 2026, plus 5 Kit Consulting accredited advisers (we subcontract under their vouchers, per `overview.md`).
   - Offer each partner one free co-branded Diagnóstico for a client of theirs.
4. **PR and data** (MK-12)
   - Publish the first *Índice Caudals* in Q1 2027, starting with the two or three sectors where we have the most public assistants sampled.
   - Pitch the Spanish business and tech press with the aggregate findings and the methodology.
5. **Associations and events**
   - Customer-experience and contact-centre associations (e.g. AEERC, DEC), sector associations where buyers gather, and colegios profesionales for expert recruitment.
   - Spanish tech events (e.g. South Summit, DES Málaga, 4YFN): a speaking slot or a CF-02 kiosk where the budget allows. Confirm dates per edition.
   - Local ecosystem: the existing supporters on the landing (Santander X, Universidad de Valladolid, Junta de Castilla y León programmes).
6. **Funding and credibility levers**: ENISA startup certification (Ley 28/2022), CDTI Neotec, regional programmes and cloud credits. These extend runway and add credibility; they do not replace sales.

**Sales playbook** (lives in Ops; summarized here):

- Discovery: 30 minutes. What does the assistant answer, what does a wrong answer cost, how is it tested today, who owns it, which documents are authoritative?
- Readout: 30 minutes in presentation mode (RP-02). Verdict, three failures, causes, what a pilot adds, price.
- Proposal within 48 hours (CO-01). Pitch the subscription at the first delivery. Fallback for "not this quarter": the €600 suite.
- Objections:
  - "Our vendor tests it": the vendor grades its own homework; we are independent and use your documents.
  - "We use LangSmith/Langfuse": those are your engineers' tools; we produce the expert-signed answer key and the business report, and you can export our set into their tools (CF-03).
  - "Data privacy": the trust page, `local_only` routing, DPA, redaction.
  - "Too early": the Diagnóstico is free and runs on public information.

**Phase 1 targets (proposed):**

| Metric | 31 Dec 2026 | 31 Mar 2027 |
| --- | --- | --- |
| Diagnósticos completed (self-serve + outbound) | 40 | 120 |
| Readouts held | 15 | 45 |
| Paid pilots signed | 3 (founding) | 12 |
| Active subscriptions | 1 | 6 |
| Dataset builds signed | 0 | 1 |
| Referral partners active | 5 | 12 |
| Vetted experts on roster | 15 | 40 |

### 7.2 Phase 2 — Europe (Apr 2027 → Dec 2027)

- **Order:** Portugal → Italy → France → DACH. Portugal is close in market and expert pool and is a natural Iberian extension. Italy and France have large customer-service markets and strong consumer-protection cultures. DACH buys quality but needs the most localization and a German expert roster.
- **Entry pattern per country:**
  1. Localize the marketing site and app (IN-02/IN-03).
  2. Recruit a native expert roster through professional associations.
  3. Sign two or three local integrator partners.
  4. Run the outbound Reality Check motion in the local language.
  5. Publish a local Índice edition after one quarter of sampling.
  6. Use Spanish customers' foreign subsidiaries as warm intros.
- **Timing:** AI Act Annex III obligations (2 Dec 2027) become the pan-European hook in H2 2027. Launch the Evidence Pack (CF-05) worded as evidence.
- **Pricing:** the same EUR price ladder. Readouts in the local language with native experts present.
- **Targets (proposed, 31 Dec 2027):** 40 paying customers in total, 30% from outside Spain, ARR ≥ €600k.

### 7.3 Phase 3 — Global (2028+)

- **LatAm Spanish** (Mexico, Colombia, Chile): reuse the Spanish packs with regional variants (IN-04); remote readouts; partners first; USD pricing.
- **English-language markets:** a self-serve Monitor plan (D-07), partners, and cloud marketplace listings if procurement demands them.
- **Data asset:** sector-generic libraries and the open evaluation environment (CF-09) become reusable and, where Caudals owns them, licensable (the overview's rules; customer data is never reused).

---

## 8. Success metrics and instrumentation

- **North star:** *evaluated cases per month under paid plans.* It grows with customers, monthly additions and dataset proof runs, and it is the asset that compounds.
- **Funnel** (AN-02): visit → Diagnóstico start (target ≥ 3% of sector-page visits) → verified signup (≥ 70%) → report delivered (≥ 60% within 72 h) → readout booked (≥ 35%) → pilot signed (≥ 25% of readouts) → subscription at first delivery (≥ 50% of pilots).
- **Product:** time to first Diagnóstico report (p50 ≤ 4 h during QA phase, ≤ 1 h after D-05 auto-release); activation within 7 days ≥ 50%; report re-view rate; shares per report.
- **Quality:** judge agreement ≥ 85% with sample size; disputed-grade rate ≤ 5%; zero published claims rejected after publication; native-review naturalness ≥ 4/5.
- **Unit economics:** machine spend per Diagnóstico (measured in PR-04; target ≤ €5); subscription gross margin ≥ 70% including expert hours; expert cost per accepted item in line with dataset-build quotes.
- **Reliability:** app availability ≥ 99.5% monthly; run recovery without lost work; queue age p95 under 10 minutes outside planned DGX windows.

---

## 9. Phase 2 work packages (ordered)

Work packages ship independently, each deployed when verified. "Verify" lists the checks Phase 2 must run; every package also runs `npm run lint`, `npm run typecheck`, `npm run i18n:check-parity` and the relevant Vitest/Playwright suites, and updates only the docs it affects.

| WP | Name | Items | Depends on | Verify | External inputs |
| --- | --- | --- | --- | --- | --- |
| **L-01** | Polish and funnel instrumentation | PO-01–PO-06, PO-09–PO-11, AN-01, AN-02, UX-01, MK-08 (unpublish part) | — | Computed-font test, consent analytics check, Accept-Language test, crawler `curl` checks (TOOLS.md), Lighthouse | Cal.com admin access (event names) |
| **L-02** | Trust, legal and security baseline | PR-02, PR-03, PR-05 (internal review), PR-06 drafts, MK-04 draft | D-06 | MFA enforcement tests, uptime and status checks, `/security-review` | Legal reviewer; status-page host choice |
| **L-03** | Lead hand-off and back office | CO-04, MN-05, CO-01, CO-02, CO-03 | D-03, D-11 | Outbox idempotency tests, alert latency check, proposal PDF snapshots | Warmbly/Ops API access, e-sign and invoicing accounts |
| **L-04** | Production model quality | EQ-01, EQ-02, EQ-06 | D-04 | Gold-set bake-off report, calibration gate, schema compatibility tests | Commercial provider key and DPA |
| **L-05** | Self-serve Diagnóstico | SS-01–SS-07, OB-01, OB-06, PR-04 | L-02 (MFA), L-04, D-01, D-05 | E2E: signup → report on fixture targets; budget-race and kill-switch tests; load rehearsal; tenant-isolation tests | Turnstile keys; Resend domain checks |
| **L-06** | Proof assets on the site | OB-02, MK-03, MK-06, MK-02, MK-11, MK-05 | L-04 (demo generated on final models), D-02, D-06 | Public-route Playwright, structured-data validation, single price source test | Final copy approval |
| **L-07** | Report and readout | RP-01, RP-02, RP-07, UX-02, UX-03, UX-06, UX-08 | L-04 (causes) | Snapshot tests ES/EN, PDF golden images, axe, harness contracts at 390/768/1440 | Native Spanish copy reviewer |
| **L-08** | Real-user acceptance | PR-01 | L-05, L-07 | WP-11 gate evidence, second-device recovery | A founding customer or tester |
| **L-09** | Help and activation | OB-07, OB-05, UX-04, UX-05, UX-09, AN-03, AN-05 | L-05 | Harness contracts, ⌘K search test | — |
| **L-10** | Subscription productization | MN-01, MN-02, EQ-10, RP-06, RP-05, RP-04 | L-03, L-07 | Scheduled-cycle integration test, digest email render, trend chart accessibility | Slack/Teams test workspaces |
| **L-11** | Evaluation depth | EQ-03, EQ-04, EQ-05, EQ-07, EQ-09, CF-07 | L-04 | Pack load tests, signature immutability tests, redaction-before-model test, legal review of EQ-04 | Legal reviewer; sector experts |
| **L-12** | Expert network | EX-01–EX-05 | D-06, L-02 | Application → trial → roster E2E; contract-required server check | Contract template from legal |
| **L-13** | Growth content and channel | MK-07, MK-09, MK-10, MK-12, MK-13, MK-14, MK-16, CF-01, PT-02, PT-03, SS-08, CO-05, CO-06, CF-03, CF-04, EQ-08, OB-03, OB-04 | L-06, D-09, D-12 | Per item; Índice legal review and identifiability check | Partner terms; native reviewers (CA/EU/GL) |
| **L-14** | Europe readiness | MK-15, IN-02, IN-03 (first country), PT-01, MN-03, MN-04, RP-08, EX-06, PR-08 (gap assessment), CF-02, CF-05, CF-06, CF-08, UX-07 | Phase 1 targets reviewed | Locale parity, routing tests, per-country legal pages | Native experts and reviewers per language |
| **L-15** | Global and self-serve monetization | D-07 Monitor plan, Stripe Billing (if D-03b), IN-04, IN-05, UX-10, CF-09, OB-08 | D-03, D-07, measured economics | Billing idempotency and webhook tests (AGENTS.md payment rules) | Stripe account; AGENTS.md amendment |

Deployment follows the existing path: an immutable image from `main` through GitHub Actions → Docker Hub → Swarm on `atlantic`. Migrations are additive with paired rollbacks, flags default off until each package's verification passes, and every deploy runs the public-surface release checks and IndexNow when public pages change (TOOLS.md).

---

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| A wrong answer key embarrasses us in a readout | Medium | High | EQ-01 calibration, D-05 human QA, EQ-05 expert sign-off, the dispute flow, conservative "preliminary" labels |
| Self-serve abuse (testing systems the user doesn't own, cost burn) | Medium | High | SS-03 authorization, SS-04 caps and kill switch, Turnstile, one free run per domain, ordinary questions only |
| Ley 10/2025 messaging read as legal advice or fear-selling | Medium | Medium | Claims test, "consulta tu asesor" note, evidence wording, legal review |
| Prospect resents an unsolicited Reality Check | Medium | Medium | Private delivery only, public information, polite tone, an immediate opt-out honoured in Warmbly suppressions |
| DGX capacity or model drift slows preparation | High | Medium | EU commercial route (D-04), recorded plan changes, honest progress UX, queue alerts |
| Expert supply lags demand in a sector | Medium | Medium | Recruit ahead (EX-01), reuse rosters across customers, sector-generic libraries |
| Founder time is consumed by delivery, not sales | High | High | Self-serve Diagnóstico, templated proposals and readouts, partner channel |
| Price publication anchors too low | Low | Medium | Pre-decided price steps (overview), "desde" pricing, founding offer limited to three |
| Index publication triggers a legal complaint | Low | High | Anonymization rules (D-09), minimum sample per sector, legal review, no screenshots |
| Single-node infrastructure outage during launch | Medium | High | Status page off-node, backups and restore rehearsal (exists), runbooks, rollback image retained |

---

## 11. Non-negotiables that bind every item (from AGENTS.md and the engine spec)

- No certification or compliance claims: we produce evidence, never conformity assessments.
- No adversarial testing (prompt injection, jailbreaks, prompt extraction) without the owner's written authorization. Self-serve never offers it.
- Provenance, PII redaction and auditability for every case, run, report and dataset item. Results are immutable.
- Experts see only the redacted material their task needs, under signed confidentiality, data-processing and IP terms.
- No marketplace, catalogue or supplier surfaces. No new code on frozen modules or legacy stacks.
- Strict separation of public pages, internal operations and authenticated surfaces. Private routes stay out of sitemaps and `llms.txt`.
- No secrets in code, logs, docs or captured media.

## 12. Inputs only founders can provide

1. Decisions D-01 to D-12 (§4).
2. A commercial model provider account with a DPA and EU processing (D-04).
3. e-signature and invoicing accounts (D-11), and the gestor's confirmation of VeriFactu readiness.
4. API access to Warmbly and Caudals Ops for lead hand-off (CO-04).
5. Cal.com admin access to rename and localize events (PO-02).
6. Cloudflare Turnstile keys (or approval of an alternative) for SS-01 and SS-02.
7. A qualified legal reviewer for PR-06, EQ-04, MK-04 and MK-12.
8. A real nontechnical tester or founding customer for PR-01.
9. Native reviewers: Spanish (UX-02, EQ-02) and later CA/EU/GL/PT.
10. Confirmation or revision of the targets in §7 and §8.
