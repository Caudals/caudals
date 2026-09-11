# Go-to-Market Playbook

How Caudals finds, earns and converts its first customers. Product and offers: `overview.md`. Evaluation method: `evals.md`.

## Finding Targets

**Public systems.** Build lists of 40 per sector. A target qualifies only if all five hold:

1. The system is reachable without an account and answers substantive questions.
2. The company publishes documentation detailed enough to serve as an answer key.
3. It has 50–500 employees.
4. We can name the likely owner and their title.
5. Its terms of use have been checked; if automated access is prohibited or unclear, the probe is manual only.

Disqualify systems that only route to a form, companies without public documentation, anything requiring an account, and companies without an identifiable owner. Sources: sector association member lists (UNESPA, regional broker associations, CEOE Castilla y León, automotive-supplier clusters), trade-press launch announcements ("lanza asistente virtual", "asistente de IA para clientes"), LinkedIn company posts, Spanish chatbot and CX vendors' customer pages, the companies' own sites, and LinkedIn people search for owner titles.

**Internal systems.** Find them through public signals, strongest first:

1. **Job postings** for AI, ML, MLOps or NLP roles (LinkedIn Jobs, InfoJobs, Tecnoempleo, careers pages). Descriptions often reveal the architecture (RAG, Azure OpenAI, LangChain, scoring models).
2. **Public grant awards** naming company, project and AI use case: BDNS (Base de Datos Nacional de Subvenciones), CDTI, NEOTEC, Misiones de I+D en IA, Red.es, ICE Castilla y León.
3. **Cloud and integrator case studies:** Azure OpenAI, AWS, Google Cloud, Databricks and Snowflake customer stories in Spain; Spanish integrators such as Minsait, NTT Data, Sngular, Paradigma, Plain Concepts, Keepler and Bosonit.
4. **Conference speakers** from Spanish companies in the last 18 months.
5. **Corporate filings:** insurers' solvency reports, annual reports, non-financial statements.
6. **University collaborations**, especially Universidad de Valladolid industry partnerships.

Record every signal in the Leads CRM with source, date, evidence URL and inferred system type.

## Getting Access to Internal Systems

1. **Integrator channel (primary).** The consultancy that built the system already has access, and a client asking "is it any good?" that it cannot answer credibly. Offer to be its independent test layer — white-labelled or on referral. Target Spanish AI/data consultancies of 10–100 people.
2. **Ladder from the public system.** On every readout call ask: "What else runs on this stack internally?" Most companies with a public assistant run two to five internal ones.
3. **Never need access.** Offer the self-run probe or output-only scoring (`evals.md` → Running). "We never touch your system" turns a months-long security review into a short conversation.

## The Reality Check Play

1. Build the list (above).
2. Write the sector probe set once: 40 questions whose answers come from each company's own public documentation, so no failure can be argued away.
3. Run the probe as a customer would: public interface, human pace, one or two sessions, synthetic personas, screenshots and timestamps for every exchange.
4. Find seven failures a non-technical director immediately recognises as bad. Quality beats quantity; never send a weak teaser.
5. Send a teaser to the system's owner: three failures verbatim in the body, each with the contradicting source; no attachment, deck or calendar link; the full report offered free.
6. Deliver the full report within 48 hours of a reply, with no sales pitch inside it.
7. Book a 30-minute readout. Let the customer ask "what would you do about it?"

Framing: "We benchmark AI assistants across Spanish insurance. Yours came out in the upper half; here are the cases where it slipped, so you have them before a customer does." Never "your chatbot is bad, we can fix it". The report is ammunition for the owner's own budget request — say so and mean it. **Send to the owner, never above them.**

Teaser shape (Spanish): subject "3 respuestas incorrectas de [asistente]"; one line on who we are; one on the method; three numbered failures with sources; the free full report, "más útil para usted que para nosotros". Follow up once after four days with a direct link.

Expected funnel per batch of 40: 24 probes run → 20 teasers → 5–8 replies (25–40%) → 4–6 reports → 3–5 readouts → 1–2 paid pilots (20–35% of readouts).

## Rules of Engagement

Non-negotiable when probing a system we have not been authorised to test:

- No prompt injection, jailbreaks, guardrail bypass or system-prompt extraction. Adversarial testing requires the owner's written authorisation.
- No authenticated areas, and no accounts created under false pretences.
- No real personal data — synthetic personas only.
- No automated high-volume traffic against third-party production.
- Never publish a named company's results in any channel, including thinly veiled posts.
- Never claim to certify, audit in a regulatory sense, or make anyone AI Act compliant.

Obligations: check terms of use and record the decision per target; identify ourselves immediately if asked and offer to stop and delete; delete on request within 48 hours; anonymise benchmarks properly (remove identifying product names and terms; publish only with eight or more participants); if a system performs well, say so first.

## First 30 Days

| Week | Evidence (founder A) | Distribution (founder B) | Done means |
| --- | --- | --- | --- |
| 1 | Choose the sector; author the 40-question probe set with citations; run 8 probes; produce 3 reports | Build the 40-company list and verify 30 owners; design the report template; write teaser, follow-up and readout script | 40 targets, 8 probes, 3 reports worth showing a stranger |
| 2 | Keep probing (companies 9–16); deliver full reports within 24 hours of requests | Send 16 personalised teasers, 08:00–09:30 Madrid; reply within 2 hours; book readouts; record customers' own words | 3–5 replies, 2–3 calls booked |
| 3 | Run readouts with founder B | Make the founding offer at least three times; send a one-page scope the same afternoon | One signed pilot |
| 4 | Deliver in 10 working days; present live | Propose the subscription; ask for two introductions and the testimonial; publish the case study with approval | Cash received, testimonial recorded |

Readout script: two minutes of context, no slides → fifteen minutes walking the failures and letting them react → ask "how are you testing this today?" → "forty questions found seven failures; nobody knows what three hundred would find" → wait for them to ask what we would do (or ask permission at minute 25) → founding offer with its real deadline → close on the next step: "I'll send a one-page scope this afternoon."

| Objection | Response |
| --- | --- |
| "We already test it." | "How many cases are in your suite, and what did it score last month?" If they know, sell the subscription. |
| "Our vendor handles quality." | "They're also the ones being graded. Who writes the correct answers today?" Offer to work with the vendor — it often becomes a channel. |
| "Too expensive." | "About three days of one developer's cost. How many hours went into arguing whether the assistant is good?" |
| "Not this quarter." | Offer the €600 suite covering only the failures already found. |
| "We can't share documents." | "Phase one uses only what is already public. Beyond that: our EU infrastructure, NDA and DPA, deletion on completion — or the self-run probe." |
| "How do we know your answers are right?" | "Every case cites your own documentation, and your expert signs off the answer key before we run anything." |
| "Who builds the dataset?" | "Vetted Spanish professionals from your sector, working to our guidelines, with every item double-reviewed and traceable." |
| "You're very young." | "We are. That's why we sent results before asking for a meeting." Move on. |

## Marketing Engine

The flagship asset is a quarterly, anonymised sector benchmark — "El estado de los asistentes de IA en el seguro español" — with 12–20 systems, one published methodology and no named companies (eight or more participants). Every included company gets a private reason to ask "which one are we?".

| Channel | Cadence | Content |
| --- | --- | --- |
| LinkedIn | 2×/week | One anonymised failure pattern: question, wrong answer, why, how to test for it |
| Newsletter *The Data Gap* | Every 2 weeks | Positioned as "what breaks in deployed AI, measured": one deeper pattern, one methodology note, one benchmark number |
| Blog | 2×/month | Method and craft: out-of-scope cases, judge calibration, coverage gaps, how expert-built data is quality-controlled |
| Benchmark report | Quarterly | Email-gated; personal follow-up with every included company |
| Methodology page | Living | Rubric, tiers, calibration, agreement; versioned and dated |

Content rule: publish only what we measured, anonymised. No generic trend pieces.

Website priorities: an outcome headline instead of a category ("Sabemos si tu asistente de IA responde bien. Con pruebas."), no "marketplace" or "dataset" above the fold, the published pilot price, `/proof` as the primary call to action once shipped, the methodology page before the first benchmark, and one case study per customer.

Channels worth one experiment each: sector associations (present the benchmark free at a members' event), integrator and agency partnerships, the Valladolid and Castilla y León ecosystem (chambers, university, regional programmes), one conference talk ("what we found testing 20 Spanish AI assistants"), and accredited Kit Consulting advisers as subcontracting partners.

## Roadmap and Gates

| Days | Focus | Gate |
| --- | --- | --- |
| 1–30 | Evidence, no code: probes, reports, first teasers, first pilot | **Pass:** one signed pilot or two prospects in written negotiation. **Fail** (0 signed, fewer than 3 replies from 16 teasers): fix report quality and examples, then run sector two. Do not abandon the approach on one batch |
| 31–60 | Repeat and systematise: sector-two list, new homepage, first case study, runner script, cases in Postgres, benchmark draft, first sector's expert roster recruited and vetted | **Pass:** three paying customers and two subscriptions. **Fail** (one customer or fewer after ~40 teasers): pause outreach for a week, run five post-mortems asking "what would have made this an obvious yes?", change the offer, not the strategy |
| 61–90 | Product and leverage: customer dashboard, automated reports, `/proof`, methodology page, published benchmark, first custom dataset built by the expert roster | **Pass:** 5+ customers, 4+ subscriptions (≈€3,500 MRR), one dataset build in progress. **Fail** (under ≈€6,000 cumulative): test the €600 micro-offer before drawing conclusions |

Beyond 90 days: months 4–6 add a third sector and its expert roster, the Plus subscription with CI integration, partner channels and a second benchmark; months 6–9 add an open environment as a portfolio piece, the AI Act evidence pack and expert-built training data sold directly to AI product companies; months 9–12 assess sector libraries as licensable datasets.

Plan, not forecast: if the gates pass, the six-month model reaches about €73,500 cumulative cash and nine subscriptions (≈€8,000 MRR).

## Metrics

Reviewed every Friday for fifteen minutes; nothing else is tracked.

| Metric | Target | Signal |
| --- | --- | --- |
| Probes run per week | 8–12 | Leading indicator; a zero week is an emergency |
| Teaser reply rate | >25% | Below 15%: the examples are not convincing |
| Report → call | >60% | Below: the report reads like marketing |
| Call → paid | >20% | Below: the offer or price is wrong |
| Days from first contact to cash | <30 | Survival metric |
| Subscription MRR | €3,500 by day 90 | The only revenue that compounds |
| Hours per pilot delivered | <40 by customer five | Falling means productising; flat means consulting |
| Sector-library cases | +150/month | The accumulating asset |
| Vetted experts per active sector | ≥5 | Capacity for subscription additions and dataset builds |

Unit economics of a €2,400 pilot: about 46 hours (≈€52/hour effective) at customer one, falling to about 16 hours (≈€149/hour) by customer eight, driven by the reusable sector library. Model and infrastructure cost is roughly €25 per pilot.

## Operating Cadence

- **Founder A — evidence:** probe sets, cases, runs, grading, rubric and calibration, report content, the freelance expert roster (recruiting, vetting, guidelines, quality), the evaluation build, delivery quality. Weekly: 8–12 probes; reports within 48 hours.
- **Founder B — distribution:** lists, research, teasers, calls, proposals, contracts, invoicing, content, partnerships, benchmark publication. Weekly: 16 teasers, 3 calls, 2 LinkedIn posts. No product code in the first 30 days.
- Both attend every customer call. No role swaps for 90 days.

| When | Ritual |
| --- | --- |
| Monday 09:00 | 20-minute plan; name one outcome for the week |
| Monday–Thursday | Mornings: outreach and calls. Afternoons: probes, cases, reports, expert review |
| Wednesday 17:00 | 15-minute pipeline review: every open conversation gets a dated next action or is closed |
| Friday 16:00 | Metrics review, then a three-line learning log (buyer, product, us) |
| Last Friday of the month | One-hour gate check against the roadmap; pre-committed decisions only |

Decision rules: either founder decides alone on deals under €5,000; new product ideas go on a list reviewed at the monthly gate; requests outside the offers default to "not now"; direction disagreements are settled by whoever owns that half of the company.

## Risks

| Risk | Antidote |
| --- | --- |
| Building the platform instead of selling | No platform code before customer three; founder B writes no product code for 30 days |
| Weak reports, no replies | Test failures on an outsider: "would this worry you if it were yours?" |
| Drift into hourly consulting | Fixed offers for six months; out-of-scope work quoted as a separate build |
| One customer dominates | Cap any customer at 40% of revenue by month six |
| A company reacts badly to being probed | Rules of Engagement without exception; apologise, delete, never argue |
| Grading error exposed | Human review of all `must_pass` failures, published agreement, written correction within 24 hours |
| Expert quality varies or experts churn | Paid trial tasks, gold items in every batch, double review, and 5–15 experts per sector so nobody is irreplaceable |
| Platforms or consultancies move down-market (12–24 months) | The moat is the expert roster, sector libraries, named case studies, the benchmark and relationships |
| Too little volume to test the strategy | A batch is 40 targets; six emails by week three is not a test |
| Morale runs out before money | A visible win every week; split roles; hold the Friday review even after bad weeks |
