# Evaluation Product Contract

What a Caudals evaluation is and how it is built, run, graded, analysed and delivered — plus the quality rules for expert-built data, which also govern custom datasets. Offers and pricing live in `overview.md`; implementation lives in `docs/ARCHITECTURE.md`.

## Artifacts

| Artifact | Format | Owner | Rule |
| --- | --- | --- | --- |
| Suite | YAML (spreadsheet → CSV during manual delivery) | Customer; Caudals authors | Versioned; frozen for each run |
| Results | JSONL, one row per case per run | Caudals, copy to customer | Immutable once the run completes |
| Report | PDF — 6 pages (Reality Check) or ~20 pages (Pilot/Full) | Customer | Generated from run data after the first three pilots |
| Dashboard | Web, magic link, read-only | Customer | Planned |
| Golden set export | JSONL | Customer | Theirs to keep and take anywhere |
| Run archive | JSONL plus manifest | Both | Every prompt, response, score, timestamp and grader; compliance evidence |
| Custom dataset | JSONL, CSV or Parquet, plus data dictionary | Customer | Built by freelance domain experts; provenance recorded per item |
| Methodology | Public web page | Caudals | Rubric, tiers, judge calibration, inter-rater agreement; versioned and dated |

## Case Schema

```yaml
- id: ins-carencia-014
  question: "¿Cuánto tiempo de carencia tiene el parto en la póliza Salud Plus?"
  reference_answer: "10 meses desde el alta en la póliza."
  accepted_variants: ["10 meses", "diez meses", "300 días"]
  must_contain: ["10 meses"]
  must_not_contain: ["8 meses", "12 meses", "sin carencia"]
  source: { doc: "Condiciones Generales Salud Plus 2026", section: "4.2", page: 14, url: "https://…", retrieved: "2026-09-02" }
  tier: must_pass
  topic: carencias
  tags: [salud, "producto:salud-plus"]
  scope: sector_generic          # or customer_specific
  locale: es-ES
  author: experto:seg-007        # freelance expert or Caudals operator
  reviewed_by: caudals:mario
  signed_off_by: cliente:jgarcia
  signed_off_at: 2026-09-05
  suite_version: 3
```

- Every case cites a source, except `out_of_scope` cases, whose correct behaviour is to decline.
- Every case records its author (freelance expert or Caudals operator) and reviewer.
- No case enters a paid run without customer sign-off.
- `scope` is commercially the most important field: `sector_generic` cases carry to the next customer in the sector. Tag it at authoring time; it is never retrofitted.

## Suite Composition

| Tier | Pilot volume | Scoring | Definition |
| --- | --- | --- | --- |
| `core` | 90–170 | 0 / 0.5 / 1 | Ordinary customer questions. 0.5 = correct but incomplete, or correct with an unsupported addition |
| `must_pass` | 20–30 | Pass/fail | Contract-critical facts: prices, limits, deadlines, safety instructions, legal statements. Any failure is a page-one incident |
| `out_of_scope` | 20–30 | Pass/fail | Pass only if the system declines, hedges appropriately or escalates. Any confident answer fails |
| `edge` | 20–40 | 0 / 0.5 / 1 | Ambiguity, conflicting sources, outdated policy, multi-hop reasoning. Reported separately |
| `robustness` | 15–30 | Pass/fail vs clean twin | Typos, dialect, Spanish/English mix, length, tone, co-official languages where relevant. Pass = same verdict as the clean case |
| `adversarial` | 10–20 | Pass/fail | Policy holds under manipulation (prompt disclosure, false commitments, policy contradiction). Authorised systems only |

A Reality Check uses 40 cases from `core`, `must_pass` and `out_of_scope` only — never `adversarial`.

## Building Cases

1. **Documents.** Ingest → chunk with section metadata → generate candidate question/answer pairs with a mandatory citation → deduplicate by embedding similarity → cluster by topic to expose coverage gaps → a human edits every case → the customer's expert signs off → freeze as a suite version. Generation is automatic; the human review is the product.
2. **Real questions,** in order of value: the assistant's chat logs, support ticket subjects, site search queries, the call centre's top-20 list, the sales team's FAQ. Request them at kickoff. Redact personal data on ingest, before storage.
3. **The 90-minute expert session.** Ask:
   - Which ten questions do new hires always get wrong?
   - Which wrong answer would cost the most, and how much?
   - What were the last three customer complaints?
   - What in the documentation is out of date?
   - Which question do you still have to check yourself?
4. **Freelance domain experts** write and review cases from guidelines — the monthly subscription additions, sector-generic libraries and hard edge cases. Customer-specific cases still need the customer's sign-off.

Budget about 2.5 minutes of human time per case; a 200-case suite is roughly eight hours across two people.

## Running

| Mode | When | How |
| --- | --- | --- |
| Hosted | Public interfaces and systems with an API we are allowed to call | Caudals calls the target. Default 6 requests/minute with jitter against third-party production; three retries with backoff; timeouts are recorded as results, never hidden |
| Self-run probe | Default for banks, insurers, health and anything behind authentication | The customer runs our runner inside its network against its own system and sends back a signed results file. Caudals never holds production credentials |
| Output-only | Scoring models, classifiers, extraction pipelines | Score a sample of historical inputs and outputs; no live access |

Every run records `suite_version` and a `model_fingerprint` (the reported model and version, or a hash of a fixed canary response), so silent vendor model swaps are detectable. Collect `retrieved_context` whenever the customer can provide it.

Results row:

```json
{"run_id":"r-2026-09-12-prod","case_id":"ins-carencia-014","suite_version":3,
 "response":"La carencia es de 8 meses.","retrieved_context":[{"doc":"CG Salud Plus 2026","section":"4.2"}],
 "latency_ms":1840,"tokens_in":812,"tokens_out":96,"cost_eur":0.0021,
 "model_fingerprint":"canary:7f3a…","timestamp":"2026-09-12T09:14:03Z",
 "score":0,"grounded":false,"confident":true,"refused":false,
 "grader":"judge","rationale":"Says 8 months; source says 10.","cause":"fabrication"}
```

## Grading

Three layers, in order. Never rely on a single LLM judge.

1. **Deterministic checks:** required entities present (numbers, dates, amounts, part numbers, article references), forbidden strings absent, citation present, length bounds, refusal patterns. Enough on their own for numeric `must_pass` cases.
2. **LLM judge:** receives the question, reference answer, accepted variants, `must_contain`, `must_not_contain` and the response. It never sees the vendor, model or company name, or prior scores. It returns `{"score": 0 | 0.5 | 1, "grounded": bool, "confident": bool, "refused": bool, "rationale": "≤30 words"}`. Use two judge models on high-stakes cases. Escalate to a human when a `must_pass` case scores below 1, the judges disagree, `grounded` is false with a score of 1, or the rationale expresses uncertainty.
3. **Human review:** 100% of `must_pass` failures and a 15% random sample of everything else. On the first customers both founders grade independently; record inter-rater agreement and publish it in the methodology.

Judge calibration: grade 40 responses by hand, including deliberately tricky ones, and require at least 90% judge agreement on `must_pass` before customer use. Recalibrate whenever the judge model or prompt changes and record the result. Pin judge versions per suite version — a mid-engagement judge upgrade breaks the regression line.

Corrections never edit results. A human review row overrides the automated verdict and is kept with the run.

## Metrics

| Metric | Definition | Reporting rule |
| --- | --- | --- |
| Accuracy | Σ score / n | Always with a 95% interval: about ±7.8 points at n = 150 and 61% |
| Must-pass failures | Count of `must_pass` cases scoring < 1 | Raw counts only ("4 of 26"); at n ≈ 25 a percentage is meaningless |
| False confidence | Wrong answers asserted without hedging / all wrong answers | The number that moves executives |
| Hallucination rate | Scored < 1 and not grounded / n | Separates invention from omission |
| Safe refusal | Declined `out_of_scope` cases / all `out_of_scope` cases | — |
| Consistency | Share of 30 repeated questions (three runs at production settings) with an unstable verdict | Cheap to measure; often the most memorable finding |
| Coverage gap | Failures where the information is absent from the corpus / all failures | Sizes the dataset build |
| Latency and cost | p50 / p95 latency; cost per answer | — |
| Regression | Accuracy delta and newly broken cases vs the previous run | From run two; the basis of the subscription |

## From Results to Conclusions

Scores say *that* a system fails; the customer pays to know *what to do on Monday*. Classify every failure by cause:

| Cause | Detection | Fix owner | Leads to |
| --- | --- | --- | --- |
| Knowledge gap — the answer exists nowhere in the corpus | Manual check of source documents confirms it is absent | Content team | Dataset build (expert-written knowledge-base content) |
| Retrieval miss — the answer exists but was not retrieved | Correct chunk in the corpus, absent from retrieved context | Engineering | Retrieval work |
| Fabrication — right context retrieved, answer contradicts it | Context present, answer diverges | Prompt / model | Prompt and guardrail work; domain Q&A or preference data |
| Source conflict — documents disagree | Contradicting chunks found | Content governance | Governance work |
| Staleness — correct under an older document version | Reference differs from a prior version | Index refresh | Subscription |
| Scope violation — answered when it should have escalated | `out_of_scope` failure | Routing / guardrails | Prompt work |
| Instruction violation — right content, wrong behaviour | Missing disclaimer, wrong language, unauthorised promise | Prompt / policy | Prompt work |

Then cross-tabulate **cause × topic × fixability** (fix the documentation / fix the system / accept). That table is the product, for example: "Billing is fine; exclusions are broken; 14 of 22 exclusion failures are knowledge gaps, so fixing eleven documents closes 60% of failures without touching the system."

- Without retrieved context, retrieval misses and fabrications cannot be separated; from final answers alone we can only split knowledge gaps from everything else. Say so in the report — it is also the honest reason internal engagements need retrieved context.
- For the top three `must_pass` failures, estimate annual exposure as *topic query volume × failure rate × cost per incident*, clearly labelled as an estimate.

## Reports

**Reality Check (6 pages):** cover (company, system, date, score) · summary (score out of 100, three findings) · method (question count, answer source, grading, what was not tested) · findings by category · seven annotated transcripts with the contradicting source · what a full evaluation would cover (nine lines at most).

**Pilot and Full Evaluation (~20 pages):** executive summary a director can forward · scorecard (with the previous run when one exists) · methodology (composition, tiers, judge calibration, agreement) · every `must_pass` failure in full · failure causes with frequency and impact · coverage gaps · robustness and language handling · latency and cost · prioritised recommendations split into "fix the documentation" and "fix the system" · all cases, responses and scores · data-handling statement.

Writing rules:

- Lead with what works; the first finding is a strength.
- Every failure cites its source.
- Separate documentation problems from system problems.
- No jargon on the summary page: not "hallucination rate" but "answered confidently with information that appears nowhere in your documentation: 14 cases".
- State the limits ("40 questions, public interfaces, one day — a sample, not an audit").
- The customer's name leads the cover; Caudals appears once, small, on the last page.
- Write in the customer's language — Spanish by default.

## Expert-Built Data

Rules for every case or dataset item a freelance domain expert produces.

- **Before work starts:** written guidelines with worked examples, a set of gold items with known answers, and a paid trial task for every new expert.
- **Provenance per item:** author, reviewer, source, guideline version, timestamps, and whether any AI tool assisted (allowed only where the guidelines say so).
- **Review:** a second expert or a Caudals reviewer checks every item; Caudals adjudicates disagreements.
- **Monitoring:** seed about 5% gold items into each batch and track accuracy per expert. Experts who fall below the threshold are retrained or removed.
- **Batch QA metrics:** acceptance rate, inter-annotator agreement, gold accuracy, rework rate and throughput — reported in the dataset's QA scorecard.
- **Dataset deliverable:** the data, schema, data dictionary, per-item provenance, QA scorecard, known limitations, and the evaluation re-run that shows the effect.

## Delivery

- Always present results in a live readout; never send a final report by email alone.
- The first three pilots are delivered manually: spreadsheet suite, a runner script of roughly 150 lines, spreadsheet pivots for analysis, HTML rendered to PDF. No platform code before the third paying customer.
- Never promise to "improve the AI" as an evaluation deliverable, guarantee a score, or claim certification, conformity assessment or AI Act compliance. We measure and produce evidence.

## Data Handling

- Redact personal data at ingest, before storage; document the method.
- Process customer content on EU infrastructure. Name every sub-processor, including model providers and their retention terms; use zero-retention or enterprise terms where offered.
- Every paid engagement has an NDA, a data-processing agreement (Caudals acts as processor), a retention period and an explicit statement that the golden set and any customer-specific dataset belong to the customer.
- Freelance experts sign confidentiality and data-processing terms and see only the redacted material their task requires.
- Default deletion 12 months after the engagement ends. Delete a Reality Check and its transcripts within 48 hours of a request and confirm in writing.
- Use synthetic personas for every probe; never submit real personal data.
