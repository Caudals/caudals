# Caudals Overview

## One-Line Description

Caudals tests whether a company's AI system actually answers correctly, delivers the evidence in a scored report, and grows each evaluation — month by month, with freelance domain experts — into a complete, custom dataset.

## The Idea

Caudals is an AI data company. The goal has not changed: build high-quality, domain-specific datasets that make AI systems reliable. What changed in September 2026 is how we enter the market — through evaluation, starting with pilot projects.

Leading with datasets failed for structural reasons:

- A dataset is an input. Most companies cannot name their data gap; they can say their AI is unreliable.
- The smallest unit we sold (a feasibility study, then a €12k+ pilot) was too large for an unknown vendor and produced nothing tangible before signature.
- Buyers with budget asked for data we could not source or process; smaller buyers did not know what a dataset was.

Evaluation removes all three blockers. The raw material is the customer's own system, documents and experts. The first artifact exists before the first sales conversation. The customer never has to learn the word "dataset" — we show them the questions their AI gets wrong.

> We don't start by selling you data. We show you exactly where your AI is wrong — then we build the data that fixes it.

## How It Works

1. **Evaluate.** Build a golden test set from the customer's documentation, real customer questions and a structured session with its domain expert. Run it against their AI system and score every answer.
2. **Report.** Deliver a scorecard, a failure analysis by cause, the coverage gaps, prioritised fixes and an estimated exposure — in a live readout.
3. **Subscribe.** Re-run monthly. Add new questions and new data every month. Track regressions.
4. **Build.** Our freelance domain experts build the custom datasets that close the gaps: expanded evaluation sets, domain Q&A, knowledge-base content, reasoning and preference data.

Each step sells the next. The report names the gaps; the gaps size the subscription and the dataset build; every month adds data to an asset the customer keeps.

## Offers and Pricing

Reviewed 2026-09-28: these are internal offer/pricing references, not verified current public tariffs or booked revenue. The landing publishes the free diagnostic and quotes paid work by scope; it has no price section. The founder confirms that the 30–100-case regional pilot and the broader offer are experiments, not a definitive replacement of either. Confirm actual scope and price before quoting.

| Offer | Price | Time | Scope | Deliverable |
| --- | --- | --- | --- | --- |
| Reality Check | Free | 48 h | 40 questions against a publicly reachable system, answers keyed to the company's own public documentation | 6-page PDF: score, failure categories, seven annotated transcripts, one page on what a full evaluation covers |
| Pilot Evaluation | €1,500 for the first three founding customers, then €2,400 | 2 weeks (target 10 working days) | 150–300 cases from documentation, real questions and one 90-minute expert session; one target system | Scorecard, ~20-page report, JSONL golden set, live readout |
| Full Evaluation | €4,900 | 9–12 days | 300+ cases; two targets (current vs candidate model or vendor); adversarial and multilingual packs on authorised systems | Pilot deliverables plus a side-by-side comparison |
| Monthly Subscription | €890/month, 12-month term; Plus €1,690/month | Ongoing | Monthly re-run, ~25 new cases and new data each month, regression alerts, quarterly review. Plus adds weekly runs, a CI webhook that gates the vendor's deploys, and named escalation | Monthly scorecard, diff against last run, newly broken cases, growing golden set |
| Dataset Build | €8,000–€25,000, expert costs included | 4–8 weeks | A custom dataset built by our freelance domain experts to close what the evaluation exposed (see "Custom Datasets") | Dataset, schema, data dictionary, per-item provenance, QA scorecard and a re-run proving the score moved |
| AI Act Evidence Pack | €3,900 | 5 days | 2027 add-on assembled from existing run history | Article 10/15 supporting documentation — evidence, not certification |

Commercial rules:

- The public website currently quotes Pilot Evaluation and subscription on scope and publishes only the free diagnostic. Do not publish the internal figures below without a separate commercial decision.
- The founding offer is used three times only: €1,500 in exchange for a named case study (approved by the customer), a 20-minute recorded conversation and two peer introductions, all written into the contract.
- Price steps are decided in advance: €2,400 after three founding customers, €3,200 after ten.
- Pitch the subscription at the first delivery. It is cancellable in the first 90 days.
- Discount one-off work, never the subscription.
- Bill one-off work 50% on signature and 50% on delivery; bill subscriptions monthly in advance.
- Credit the pilot against a dataset build signed within 60 days.
- Fixed offers only. Never bill by the hour.
- Fallback for "not this quarter": a €600 suite covering only the failures the Reality Check found.

## What We Evaluate

Text and document AI systems:

- customer-facing assistants and chatbots (web, app, WhatsApp),
- voice and IVR agents,
- internal assistants (HR policy, sales enablement, technical support over manuals),
- document triage, classification and extraction pipelines,
- AI features inside products (quote assistants, clause analysers, valuation explanations).

**Qualify on consequence, not existence.** Evaluate systems where a wrong answer costs money: insurance coverage and waiting periods, banking fees and eligibility, energy and telco tariffs, airline refund rights, dosage and interactions, technical specifications. Skip low-stakes widgets: order tracking, store hours, bookings, generic lead capture.

**Public systems open the door; internal systems carry the budget.** A public assistant is often a small share of a company's AI spend. Its evaluation earns the meeting where we find the internal systems.

## Who We Sell To

- **Size and buyer:** 50–500 employees. The buyer owns the AI system — Atención al Cliente, Transformación Digital, Canal Digital, Postventa/Servicio Técnico, Calidad or Operaciones — and can sign €2,400 without a committee.
- **Trigger:** the company launched or announced an AI system in the last 18 months.
- **Channel partners:** Spanish AI and data integrators and agencies that build these systems. We are their independent test layer, white-labelled or on referral.

Target definition: *Spanish companies with 50–500 employees that launched a customer-facing or internal AI assistant in the last 18 months, where the owner cannot currently prove it answers correctly.*

## Where Ground Truth Comes From

We build the machinery that extracts expertise and makes it checkable.

1. **The customer's documents** are the answer key for anything written down.
2. **The customer's expert** defines what "correct" means in a structured 90-minute session and signs off the answer key, so results cannot be disputed later.
3. **Our freelance domain experts** write and review cases — especially the monthly subscription additions and the sector-generic libraries — and build the custom datasets.

## Custom Datasets

The evaluation shows what data is missing; our freelance domain experts build it; a re-run proves it worked.

1. **Scope** — failure causes and coverage gaps define the dataset: type, volume, schema and acceptance criteria.
2. **Specify** — Caudals writes the task guidelines and gold items, and assigns vetted experts.
3. **Build** — experts produce the items; a second expert or a Caudals reviewer checks every one.
4. **Assure** — agreement, gold accuracy and provenance are measured per batch; rejected items are reworked.
5. **Deliver** — dataset, schema, data dictionary, per-item provenance and QA scorecard.
6. **Prove** — re-run the evaluation and show the score moved.

| Dataset | How experts build it | Used for |
| --- | --- | --- |
| Expanded evaluation sets | New cases, reference answers and edge cases every month | Regression testing, benchmarks |
| Domain Q&A | Question/answer pairs grounded in documentation and professional practice | Few-shot libraries, fine-tuning |
| Knowledge-base content | Writing the missing or contradictory documentation the evaluation exposed | Retrieval (RAG) corpora |
| Reasoning and solution traces | Solving real cases step by step | Fine-tuning, reasoning evaluation |
| Preference data | Ranking and correcting candidate answers | Preference tuning (RLHF, DPO) |
| Labelled domain examples | Classifying real tickets, claims or documents | Classifiers, routing, extraction |

How the data grows:

- Subscriptions add roughly 25 cases a month per customer — expert-authored and mined from customer logs — so each evaluation set grows into a full evaluation dataset.
- Every item is tagged `customer_specific` or `sector_generic`. Sector-generic items that Caudals owns (authored by our experts from public or licensed sources) accumulate into reusable sector datasets that make each new customer cheaper to serve and can later be licensed. Customer data and customer-specific items are never reused or licensed.

## Freelance Domain Experts

We hire freelance domain experts to build custom datasets — the model AfterQuery and Mercor run for frontier labs, sized for the Spanish mid-market. Caudals owns the specification, tooling, review and quality; the experts bring the domain knowledge.

- **Profiles:** practising or recently retired professionals — peritos de seguros, claims handlers and underwriters; técnicos de mantenimiento and after-sales engineers; abogados and asesores fiscales; nurses and doctors.
- **Roster target:** 5–15 vetted experts per active sector, recruited once and reused across customers. A managed roster, not an open marketplace. This target is not evidence that those experts have already been recruited.
- **Recruiting:** colegios profesionales and sector associations, LinkedIn, Universidad de Valladolid and other alumni networks, freelance platforms, and referrals from customers' own experts.
- **Vetting:** credentials check plus a paid trial task graded against gold items; only experts above the agreement threshold join.
- **Pay:** per task or per accepted item, benchmarked at roughly €30–€60/hour. Expert cost is included in every dataset-build quote.
- **Contracts:** a freelance services agreement with IP assignment (to Caudals for sector-generic work, to the customer for customer-specific work), confidentiality, and data-processing terms whenever they handle customer material. Experts invoice as autónomos or through their company and are engaged per deliverable, not on fixed schedules, to avoid false self-employment (*falso autónomo*) risk.
- **Access:** experts see only the redacted material their task needs.

## Out of Scope

- Two-sided marketplace, catalogue browsing and purchase, supplier revenue share, Stripe Connect payouts.
- Sourcing or reselling third-party data.
- Image, video, audio, geospatial and sensor data; deals needing more than a few gigabytes of processing.
- Commodity labelling at volume, generic AI consulting or integration, and a self-serve evaluation SaaS for developers. We build expert-authored, domain-specific data, not generic annotation.
- Frontier labs and RL-environment sales. Around month five or six, consider one open environment in our domain (Spanish customer service, technical operations) as a public portfolio piece.

## Market Context (2026)

- **Expert data and evaluation are the business reference.** AfterQuery's public positioning emphasizes expert knowledge structured into training data; its FinanceQA paper is a concrete benchmark reference ([AfterQuery](https://www.afterquery.com/), [FinanceQA](https://arxiv.org/abs/2501.18062)). Caudals adapts this to accessible Spanish buyers and evaluation-led entry, not an assumed frontier-lab customer base.
- **Reliability is the problem to validate with buyers.** Deployment alone does not establish trustworthy answers. The earlier adoption percentages and supplier acquisition claims were not reverified in this documentation refresh; do not use them as current market evidence without dated primary sources.
- **Spain is the initial market hypothesis.** Local professional expertise, Spanish-language material and regional access are differentiators to test, not proof of an unserved market or of paid demand.
- **Regulation supports evidence work, not certification.** Verify current official legislation, applicability and dates for each proposal. Earlier specific AI Act/Omnibus dates in this brief are not maintained as legal authority. Caudals produces evaluation evidence, not conformity assessments.
- **Public funding and institutional access are channels to investigate.** Check current eligibility and partner terms before relying on an advisory voucher or claiming an accredited status. Lists of regional institutions do not demonstrate an existing relationship.
- **Competition.** Developer evaluation platforms, data providers and consultancies are alternatives buyers may already use. The intended edge is expert-validated answer keys, traceable datasets, domain libraries and close delivery. Validate it against actual buyer alternatives rather than assuming a fixed consolidation timeline.

## Product Surfaces

- **Live public:** `/`, `/sectors` and one page per sector (insurance, industrial after-sales, healthcare, banking, energy, telecoms, legal and advisory, travel), `/contact`, `/call`, `/blog`, `/newsletter`, `/legal`.
- **Private:** `/admin` Operator Console.
- **Deployed evaluation surfaces:** `/ops`, `/workspace`, assignment-scoped `/review`, private report sharing and exports, with invite-only access, entitlements and target-specific readiness. `/proof` remains a future demo, not a deployed funnel step. See `docs/ARCHITECTURE.md` and the evals work-package records.
- **Removed marketplace routes:** `/buyer`, `/supplier`, `/v1/*`, `/security` and former pricing/catalogue surfaces return 404. Retained internal dataset-build modules do not make those routes a current product.

## Pitches

**Elevator pitch.** Companies are deploying AI assistants faster than they can check them. Caudals builds a test set from each company's own documentation and experts, measures exactly where its AI answers wrong and why, and hands over the evidence in a report a director can act on. Every month the test set grows with new questions and new data, and the gaps it exposes become custom datasets built by our domain experts.

One-line variants:

- Caudals tells you whether your AI answers correctly — with proof.
- We show you where your AI is wrong, then our domain experts build the data that fixes it.
- Independent evaluation for AI assistants, in Spanish, with answer keys signed off by your own experts.
- Custom datasets written by practising professionals, not generic annotators.
- Public homepage copy is maintained in `lib/i18n/messages/{en,es}.json`; use those current strings when quoting the site, not an earlier pitch variant.
