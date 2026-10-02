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

Each result shows: question, the system's answer (plus any buttons it
offered), the **expected answer (ground truth)**, the key-fact checklist, the
cited source excerpt, the verdict explanation, contradictions and unverified
extras, and the review status. Results download as CSV with the expected
answer and verdict.

## Re-grading

`POST /api/evals/v1/runs/{id}/regrade` (workspace write access) re-grades a
completed or partial run with the current engine without contacting the
system again. It skips results with a human override or review decision.
Judge calls are budgeted like any other; when they finish, a new preliminary
report revision is published and the workspace is notified ("Results
updated").

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
- Saved logins and website attestations do not expire; they stay until
  revoked. The live studio stays open for two hours (30 minutes idle).

## Rollback

Grades are append-only. Rolling back the code makes new runs use
`deterministic-v1` again; v2 assessments remain valid evidence and old reports
keep rendering (new snapshot fields are optional).
