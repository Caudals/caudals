# Grading Engine v2

How Caudals decides whether an answer is correct, why, and what a customer
sees. Applies to every automatically finalized run (deployed systems, web
apps) and to re-grades. Grader revision `caudals-grader-v2`, judge prompt
revision `caudals-answer-judge-v2.x` (bumped on every prompt change; all v2.x
revisions share the output contract below).

## Why v2

Production evidence (October 2026):

- **Indexa** (10 tests): every result failed or was partial. The
  `correctness` criterion required the *entire* expected answer as a literal
  substring of the reply ("Missing 1 required claim" on every case), and the
  judge failed `grounding` whenever the reply added facts that the single
  cited excerpt did not mention, although the bot's knowledge base is larger
  than one excerpt. Correct, paraphrased answers scored 0.
- **Mapfre** (10 tests): the web connector captured the user's own question,
  echoed back by the widget, as the bot's answer; the judge then failed it
  (or, worse, passed "grounding" because an echo claims nothing).
- Generated tests used literal spans as expected answers, so ground truth was
  often a menu label, tagline or table header, with a few mismatched
  question/answer pairs. A bad test was graded as a bot failure.

## Principles

1. **Meaning, not wording.** Paraphrases, other languages, extra politeness and
   formatting are correct when they convey the expected facts.
2. **Open world.** Extra details that the evidence neither confirms nor
   contradicts are recorded as *unverified*, never failed. Only a
   contradiction of the reference or evidence is a correctness failure.
3. **Separate the bot from the test.** A questionable test, a capture problem
   or an execution error is *not scored*; it never lowers the bot's score.
4. **Explain in the customer's language.** Every verdict carries a one- or
   two-sentence explanation in the test's language.
5. **Append-only and reproducible.** A grade is a new assessment that
   supersedes the previous one; human decisions are never overwritten.

## Outcomes shown to customers

| Label | Stored outcome | Counts in score | Meaning |
| --- | --- | --- | --- |
| Correct | `pass` | yes | Conveys every key fact, nothing contradicted. |
| Partly correct | `partial` | yes (half credit in the quality score) | Some key facts present, none contradicted. |
| Incorrect | `fail` | yes | Wrong or contradicting information, or key facts absent. |
| No answer | `fail` + category `no_answer` | yes | Deflection, "rephrase please", menu without answer, off-topic, empty. |
| Test needs review | `unscorable` + `reference_issue` | no | Question unclear or expected answer wrong/incomplete. |
| Not captured | `unscorable` + `capture_suspect` | no | The captured reply repeats the question or is clearly not the bot's. |
| Not run | `unscorable` (execution) | no | Timeout, transport or target error. |

Headline: **"N of M answers correct"** (strict pass rate over scored tests)
plus a **quality score** = (correct + ½ partly correct) / scored. Coverage and
intervals stay in the methodology.

## Pipeline

1. **Pre-checks** (deterministic, no model):
   - empty reply → `fail`, `no_answer`;
   - reply equal to the question (or the question plus ≤ 12 characters, e.g.
     a timestamp) → `unscorable`, `capture_suspect`, needs review.
2. **Deterministic graders** (`exact_match`, `decimal_equal`, `json_schema`,
   `tool_state`) keep their v1 behaviour.
3. **Semantic graders**: `claims` and `llm_judge` criteria are graded by the
   answer judge in one call per result. Without a judge route, `claims` use a
   normalized lexical match (accent-, case- and punctuation-insensitive,
   numbers normalized, ≥ 75 % of each fact's content words). Lexical matching
   can confirm a fact but never prove it absent, so a reply with no matched
   fact is `unscorable` (needs review) rather than `fail`.
4. **Outcome mapping** (below) and **review policy**.

### Questions written or edited by people

Adding a question to a draft, or editing a question or its expected answer, rebuilds its reference (`lib/evals/contracts/reference-edits.ts`): key facts, acceptable alternatives, answerability, prohibited claims and cited excerpts are taken from the edit or cleared, never inherited from the template or the previous wording, because the judge requires every key fact. Without key facts the judge grades against the expected answer alone. The editor exposes key facts, other acceptable answers and the expected behaviour (answer, decline or refer, ask for missing information, say it is not documented). A title-only edit keeps everything. Grader order is preserved because rubric criteria are matched to graders by position.

A question added by hand cites no source excerpt, so a source-grounded draft that contains one cannot be frozen as is. **Freeze as exploratory** (`POST /suites/:id/versions` with `exploratory: true`) freezes that version with `evidence_policy: exploratory`: the judge grades against the reference answer, key facts and web research, and every other bundle check still applies.

**Importing questions with their source** (`POST /suites/:id/cases/import`, up to 100 per call): each item carries the question, expected answer, optional key facts, alternatives, answerability and severity, and `source: {quote, url?}`. The quote must appear verbatim (case and spacing ignored) in the draft's frozen sources, inside the given page when `url` is set; the case then cites the anchors the quote spans, exactly as a generated case does, so the draft can be frozen as source-grounded. Any quote that is not found rejects the whole batch and names the rows (`lib/evals/contracts/quote-anchors.ts`).

### Answer judge v2

Input (judge-only, never sent to the system under test): the question(s), the
expected answer, acceptable alternatives, key facts (`required_claims`),
prohibited claims, answerability, up to five source excerpts, the captured
reply as delimited untrusted data, any quick-reply buttons the bot offered,
and the criteria to grade. Output, strict JSON:

```json
{
  "verdict": "correct | partially_correct | incorrect | not_answered",
  "key_facts": [{ "fact": "…", "status": "present | missing | contradicted" }],
  "contradictions": ["…"],
  "unsupported_claims": ["…"],
  "reference_issue": null,
  "failure_category": "no_answer | wrong_information | missing_information | contradicts_source | off_topic | null",
  "criteria": [{ "criterion_id": "…", "verdict": "pass | partial | fail", "rationale": "…" }],
  "explanation": "≤ 400 characters, in the test's language",
  "confidence": "high | medium | low"
}
```

`reference_issue` is one of `question_unclear`, `expected_answer_wrong`,
`expected_answer_incomplete`, `not_answerable_from_source` or null. For
`must_abstain`/`unanswerable` cases, declining or escalating is correct and
inventing an answer is incorrect.

Validation is lenient about form and strict about meaning: code fences and
prose around the JSON are stripped, unknown fields ignored, missing optional
fields defaulted, quotes not found in the reply dropped. A criterion the judge
omitted is derived from the verdict. Output without a valid `verdict` is
rejected (`judge_output_schema_invalid`) and the result stays not scored until
re-graded.

### Outcome mapping

| Condition (first match wins) | Outcome |
| --- | --- |
| `reference_issue` set | `unscorable`, needs review (test excluded) |
| verdict `not_answered` | `fail` (`no_answer`) |
| verdict `incorrect` or any contradiction | `fail` |
| verdict `partially_correct` | `partial` |
| verdict `correct` and a deterministic grader failed | `partial` |
| verdict `correct` | `pass` |

Criterion scores are stored for traceability: claims criteria score the share
of key facts present (0 if any is contradicted); judge criteria score
pass 1 / partial 0.5 / fail 0.

### Review policy

`needs_review` only when the test has a reference issue, the judge reports low
confidence, the capture is suspect, or a `critical` test did not pass.
Everything else is an automated grade (`unreviewed`). Judge calibration against
human decisions is still measured per workspace and disclosed in the
methodology, but it no longer marks every result as experimental.

### Findings

Failed and partly correct results are grouped by failure category (no answer,
wrong information, incomplete, contradicts your documentation, off topic),
each with a plain-language observation and recommendation. Tests needing
review and capture problems become limitations, not findings.

## Results presentation

The results table shows one row per test: the question, its result label,
the one-line reason and the severity. Clicking a row opens that result as its
own full-width page inside the report (back to all results, previous/next,
← → keys, Esc returns to the list): the verdict with its explanation (the
label appears once), the question and the system's answer (with any buttons
it offered), the **expected answer (ground truth)** with its key-fact
checklist, contradictions, extra details (unverified or confirmed online),
the cited source excerpt, pages checked on the web and collapsed technical
identifiers.

Results download as CSV, PDF and Word with the expected answer and verdict.

## Web research

Settings → AI models has a **Web research** panel: one switch per task
(reading sources, drafting tests, grading) and the **search engines** that
make it work with every model, the private DGX Spark included.

- **Search engines** (migration 071, `evals.web_search_connection`): Tavily
  (primary) and Exa (backup). Keys are platform secrets like provider keys:
  write-only, checked with one live search before they are saved, encrypted
  with the platform keyring (scope `web_search`) and read only by the
  inference worker. Each search uses one credit from the engine's plan; that
  cost is not in the token estimate.
- **How a call searches:** an engine call that carries `webSearch.queries`
  (at most three) has them run by the inference worker on the first engine
  that answers, before the model is called. The results go to the model as
  one extra message framed as untrusted data, trimmed to the room left in
  its context (48 KB at most), and are kept with the result
  (`output.webSearch`: engine, queries, pages) and as `citations`. Only
  when no engine is connected can an OpenRouter model use OpenRouter's own
  web plugin (paid per result); with an engine connected the plugin is never
  used, even when a search finds nothing.
- **Where it searches:** the company's own site first. When the project has
  a website connection, judge and draft queries are restricted to its
  registrable domain (subdomains such as a help centre included); otherwise
  they are led by the product name.
- **Grading:** the query is the test question. The
  judge may check details the cited excerpts do not cover. Details the web
  confirms are listed as "confirmed online"; details it contradicts become
  contradictions. The expected answer stays the ground truth; a web page
  never overrides it. Consulted pages are recorded with the verdict
  (`web_sources`).
- **Drafting tests:** the query asks for the customers' FAQs. Web
  results only help phrase questions the way real customers ask; answers,
  key facts and quotes still come from the sources.
- **Find sources on the web** (preparation): two queries, one restricted to
  the company's own domain, then the reading-sources model proposes public
  pages about the product (help centre, FAQs, terms, pricing; the company's
  own site first). The person picks which to add and each is captured as an
  ordinary website source (up to 3 pages from that address), so tests keep
  citing frozen excerpts (`evals.web_discovery_job`, migration 070; prompt
  `caudals-web-discovery-v2`).

## Model output and transient failures

Free and small models do not always return clean JSON, even in JSON mode.
`lib/evals/providers/model-json.ts` parses every engine reply (profiles,
drafts, verdicts, web discovery) with structural repairs only: fences and
prose are stripped, raw control characters escaped, trailing commas and
stray or premature closing brackets dropped (an object closed while its
members still follow, at the top level or inside a list). Profiles also get a lost
`{"values":` wrapper back (seen on 2026-10-03: `"materialRisks":[…],
"confidence":…}` closed the whole profile early and paused every Indexa
preparation). Repairs never invent content and the result is still
validated against the contract; truncated output stays invalid.

Provider failures on engine calls (`generator`, `context_analyzer`, `judge`,
`report_writer`) no longer stop a job at the first error:

- A busy, failing or unreachable provider (`overloaded`,
  `service_unavailable`, `network_unavailable`) is tried again, three
  attempts in all, after 15 s and 60 s. An attempt whose outcome is unknown
  keeps its possible charge as an unresolved reservation. Calls to a
  customer's system keep the stricter rule (unknown outcome = review).
- A model that refuses a reasoning flag (OpenRouter: "Reasoning is mandatory
  for this endpoint and cannot be disabled") is asked again with low
  reasoning effort, then with no reasoning flag at all. The retry-after-invalid-output path asks for reasoning
  off, which such models reject; this fallback is what keeps it working.
- Preparation no longer depends on the page staying open: every minute the
  scheduler advances jobs whose model step finished (`profile_ready`,
  `draft_ready`) or that stopped for a reason the engine retries itself, with
  the same code the page calls (`advancePendingGenerations`). Finalizing is
  idempotent per input, so page and scheduler can both advance a job.
- A key or account out of credit (HTTP 402, or "Key limit exceeded" /
  "insufficient credits") is reported as `quota_exceeded` with its own
  message, not as a wrong key, and does not block the provider once the
  limit is raised.
- Every failure logs the provider's own explanation, shortened and with
  key-like strings masked (`provider_call_failed`), and preparation shows
  what to do next (another model, a new key, or try again later).

## Re-grading

`POST /api/evals/v1/runs/{id}/regrade` (workspace write access) re-grades a
completed or partial run with the current engine without contacting the
system again. It skips results with a human override or review decision.
Judge calls are budgeted like any other; when they finish, a new preliminary
report revision is published and the workspace is notified ("Results
updated").

## Complete results sheets

When the answers are collected and graded by people (for example while a
website connection cannot capture a chatbot), an evaluation with an approved
test set accepts a complete results sheet instead of a run:

- **Download grading sheet** (`GET /evaluations/{id}/graded-results`) lists every
  question with its ids, expected answer, key facts, expected behaviour and the
  cited source excerpt, plus empty `system_answer`, `veredicto`, `motivo`,
  `datos_clave_estado`, `categoria_fallo` and `contradicciones` columns.
- **Upload complete results** (`POST`, CSV with comma or semicolon, or XLSX)
  requires every question exactly once. `veredicto` is `correcta`, `parcial`,
  `incorrecta` or `no responde` (English values work too); `motivo` is required;
  `datos_clave_estado` lists `presente`, `falta` or `contradice` per key fact,
  separated by `|`.
- One transaction creates an `imported_responses` run, each answer as an
  observation, the lexical v2 grade as baseline and the person's verdict as a
  human override of it with a review decision, the same trail as reviewing in
  the app. The verdict is stored in the `caudals.evals/verdict` extension
  (`engine: human-review`), so key facts, failure category and contradictions
  read in the report exactly as a judged result does, with `graded_by: human`.
- A reviewed report is then created and published. Uploading the same file again
  returns the same run and retries the report.

## Test generation v2

Draft cases carry a natural-language `expected` answer that directly answers
the question, plus 1–4 `keyFacts` copied literally from the supporting quote.
Provenance is enforced on the key facts (each must occur in the quote or its
excerpt); the expected answer is free text. Questions must be self-contained,
realistic and in the source language; navigation labels, slogans, cookie
banners and table headers are never questions or answers. Cases without key
facts fall back to the v1 rule (expected must be a literal span). Case
language is detected from the question, and the title is the question itself.

## Web capture rules

- Messages equal to the prompt (the user's echoed bubble) are ignored; the
  executor keeps waiting for the bot's reply.
- All new assistant bubbles of a turn are joined, in order.
- After the completion signal, a 1.5 s settle window catches late bubbles.
- Quick-reply buttons that appear with the reply are recorded
  (`caudals.evals/browser.actions`) and shown to the judge and the customer.
- Guided follow-up: when the reply offers buttons and exactly one button's
  label clearly matches the question, the executor clicks it (at most two
  steps, never links leaving the site or purchase/contact/delete actions) and
  records the step in the transcript.
- Saving an untested setup in the live browser (a newly taught draft) no
  longer takes down a connection that already works: the verified setup
  stays active, re-attested from its own probe evidence, until the draft
  passes its test and replaces it.
- Saved logins and website attestations do not expire; they stay until
  revoked. The live studio stays open for two hours (30 minutes idle).

## Rollback

Grades are append-only. Rolling back the code makes new runs use
`deterministic-v1` again; v2 assessments remain valid evidence and old reports
keep rendering (new snapshot fields are optional).
