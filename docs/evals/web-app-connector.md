# Web App Connector

Connects an AI system that is only reachable through a browser UI: public or
authenticated apps, embedded widgets, iframes, SSO and 2FA. Available from an
evaluation's web app section and the website system panel. Workspace managers
and assigned operators can open it; viewers cannot see browser pixels or send
input. Connecting a website records the workspace member's testing
attestation automatically (bounded, non-adversarial questions only; there is
no separate checkbox), and the target must be permitted by the browser
worker's workspace allowlist.

## Customer flow

1. Enter the website URL when creating an evaluation.
2. **Open live browser** starts an isolated Chromium context and shows it in a
   full-screen studio. The person is in control at once: click, type, paste,
   scroll, use back/forward/reload, the address bar and popup tabs to sign in
   and complete SSO, 2FA or CAPTCHA themselves.
3. **Connect system** is one click. Caudals:
   - declines a cookie-consent dialog that covers the page (Reject / necessary
     only, never Accept; a notice with no choice is only acknowledged). Every
     fresh session, run and Test does the same;
   - finds the message box in every frame (iframes, open shadow roots), scoring
     chat-like inputs and rejecting search, login and newsletter fields;
   - opens the chat when it is closed, trying likely launchers, including a
     plain floating element with a pointer cursor in a corner (an avatar or
     bubble that is not a button). Links to other pages rank below in-page
     widgets, and a click that leads to a page without a chat (an article, a
     sales form) is undone before the next candidate is tried;
   - finds the Send button next to the input, or falls back to Enter;
   - sends one short hello, observes what the page adds, and identifies the
     reply as the largest new region that is not the user's own message (the
     element whose text is exactly the prompt, so echoing assistants work);
   - learns the completion signal: a Stop button or loading indicator that
     disappears, Send becoming available again, or network-confirmed quiet;
   - reloads the start page in a fresh context and learns the launcher if the
     chat is closed there;
   - runs Test Connection: two fresh sessions and a follow-up probe. Each
     fresh session gets one more try before it fails the Test, and a reply's
     allowance starts once the chat is open, not before the page loaded.
   Detected elements are outlined on the live view with labels. **Connect
   again** on a page that an earlier probe turned into a conversation URL goes
   back to the chat it started from before detecting again.
4. A passing test saves the encrypted login and freezes an immutable recipe
   and target revision. A failed test still saves the draft and login so the
   person never has to sign in twice. Saved logins and website attestations
   do not expire on Caudals' side; they last until revoked (Systems → Saved
   sign-in) or until the site itself ends the session. There is no
   storage-state (cookie JSON) upload: the live browser is the only way to
   save a login.
5. The element list (**What Caudals uses**) and manual **Fix** controls appear
   only after a failed connection attempt. Click Fix, select the element in
   the live view, and test again; the controls disappear after a saved success.

Login state is checkpointed before connecting, after failed detection (even
when no reply locator was found), and when closing the live browser. Saving a
login keeps the latest connection check on its new immutable target revision.
The studio shows Connected only after persistence succeeds and offers a save
retry if the server fails. A site can hand off between its apex, `www` and
`app` HTTPS origins (for example `www.maite.ai` → `app.maite.ai`); other
origins remain outside this navigation allowance. Only the target, its app,
and taught frames enter the saved state, never an unrelated SSO provider.
The clean authenticated page is saved for reopening even before a recipe
passes. Recipes use the composer URL from before the first probe, so a
conversation URL created by sending a message is not mistaken for a fresh chat.

New evaluations can select **Use a connected system**. They share the same
workspace system, encrypted login and connection recipe while keeping their
own projects, sources and test sets. New runs follow the system's latest
website connection revision; existing run plans remain immutable.

Locators prefer test IDs, exact roles/accessible names, labels and stable
attributes or class names (build-hashed classes are ignored). Up to three
fallback locators per part are frozen in the recipe
(`extensions["caudals.evals/teach"].alternates`), so a fallback used during a
run is reproducible. No XPath, positional CSS or customer JavaScript is
generated. Reply locators must match only assistant messages, never the
user's.

## Completion and acceptance

Recipes complete on `selector_hidden` (Stop/loading indicator),
`send_enabled`, or `quiescent`: the reply text, the page's streaming requests
started by the prompt and WebSocket frames have all been quiet together for
1.5 s. Text stability alone never completes a reply; a request open for more
than a minute is treated as a notification channel. If an explicit signal is
too brief to observe, a 5 s network-confirmed quiet period is the fallback.

Capture rules for real, imperfect chatbots (`docs/evals/grading-engine.md`):

- the user's own message echoed into a bubble the reply locator also matches
  is ignored (equal to the prompt, allowing sender labels and timestamps), so
  the executor keeps waiting for the bot's reply;
- every new assistant bubble of the turn is joined in order (bots that split
  one reply), with history re-renders, trimming and in-place growth handled;
- after the completion signal a 1.5 s settle window catches late bubbles;
- quick-reply buttons added with the reply are recorded in
  `caudals.evals/browser.actions` and shown to the judge and the customer; a
  reply made only of buttons completes on network quiet;
- guided follow-up: when exactly one button's label clearly matches the
  question (shared word stems ≥ 50 %, unique best), the executor clicks it, at
  most twice, never for links leaving the page or purchase, contact, sign-in,
  deletion or survey labels. The step appears in the transcript as
  `→ label` and in `caudals.evals/browser.guided`.

A probe qualifies when both fresh sessions captured a complete, new,
duplicate-free reply and the reset held (`probeEvidenceReady`). Identical
replies to different prompts are recorded (`distinct_responses`) but allowed:
rule-based assistants answer many questions with one sentence.

Unattended connection checks run the same detection headlessly with the saved
login, so many public chatbots connect without opening the live browser at all.
They run ahead of queued test cases on the browser queue. A check that finishes
after someone connected the system in the live browser does not replace that
connection, and its new revision keeps any login saved meanwhile. A saved login
carries over only a finished connection check, never a queued one.

## Live view and session lifecycle

The browser executor exposes an internal control listener on 8089 with
`/control` (commands) and `/stream` (live view). The existing relay forwards
only that fixed destination and PostgreSQL; there is no published
browser/debugger port and Chromium keeps its restricted egress network. The
app uses `EVALS_BROWSER_CONTROL_URL` if set, otherwise
`http://caudals-evals-browser-db-relay:8089/control`.

Pixels come from a CDP screencast (JPEG, only on repaint, at most ~14 fps per
viewer, frames dropped under backpressure rather than queued). The app relays
them to the signed-in manager as Server-Sent Events
(`GET /api/evals/v1/targets/{id}/web-app/stream`); the client decodes them off
the main thread into a canvas. Input is batched: one request in flight, mouse
moves and typed characters coalesce meanwhile, events replay in order.
Typed characters produce real key events (2FA boxes listen for them); paste
inserts text in one step.

Every request is sealed with a purpose-derived key from the browser-only
keyring; request IDs, timestamps, direction, workspace allowlist and
actor/target binding are verified and replays rejected. Each stream line is
sealed to its request ID and sequence number, so lines cannot be reordered or
replayed. Pixels, input and storage state never enter a database, a command
queue or logs; customer API responses never contain storage state.

Up to `EVALS_BROWSER_INTERACTIVE_SESSIONS` (default 2) interactive sessions run
per browser service. Reopening the same connector resumes its session. A
session closes after twenty idle minutes, two hours in total, or three
minutes after its last viewer disconnects (unless Caudals is still working).
Source captures defer while an interactive session is active.

Saved cookies, local storage, IndexedDB and session storage belong only to the
target and the taught frame origins; identity-provider state is discarded
after sign-in. Encryption uses the target-scoped envelope registry; only the
browser executor decrypts saved state. Saved sessions have no Caudals-side
expiry (stored as a far-future `expires_at`) and can be revoked through the
session UI. Eval scenarios always use fresh
contexts, preserving conversation state only across turns of one scenario.

## Runs, failures and repair

Eval runs use the normalized target interface (`TargetExecutionWorker`), the
same observations, scoped attempt credentials and usage ledger as API targets.
On load the executor waits for the input and clicks the launcher only while
the chat is closed (a widget that restores itself open is not toggled shut).

- Expired login (redirect off the target origin, a login path, or a visible
  password field) → `browser_session_unavailable`.
- Selector failure, ambiguity, missing launcher or frame → `website_selector_failed`.
- Incomplete streaming → `capture_incomplete`.

A website test gets 120 s (the case and target allowances are not cut below
that), and once the chat is open its reply always has at least 90 s (60 s for
each follow-up turn of a conversation), so a slow page does not cut off a slow
assistant.

Real sites miss a reply now and then. A failed browser attempt is repeated in a
fresh browser context, three attempts in all, 5 s and then 20 s apart. A
browser turn has no external charge, so a failed one is recorded with its
reason rather than left as an unknown outcome that would block retries or a
resumed run. When the browser service restarts mid-test (a deploy), the test
simply runs again. Partial answers are never graded.

A test that still fails after its retries is recorded as not captured and the
run continues. The run pauses for repair only when the connection itself looks
broken: the saved login expired, the last three finished tests all failed, or
nothing was captured after two tests. Only then is a `needs_operator`
connection check recorded, so the evaluation page shows **Repair connection**.

A paused run shows how many tests were answered and offers **Resume** (the
remaining tests continue on the run's frozen revision) and **Finish and grade
N answers**, which stops it and grades and reports the answers captured so far
(a partial report). Stopping a run any other way also sends its captured
answers to grading. Repairing the connection (teach or fix, then test) applies
to new runs; existing run plans are never rewritten.

A fully paused run releases its workspace execution slot. Running steps or
case units still draining hold the slot, and resuming reacquires it under the
same workspace lock as starting a run.

Supports public HTTPS apps reachable through the existing egress policy.
Private network apps still use the private runner. Closed shadow roots,
hardware-bound authentication and sites blocking remote/headless Chromium
require assistance. CAPTCHA and authentication are completed by the customer,
never bypassed. Clean hash routes are retained; auth query parameters and
unsafe fragments are discarded from saved navigation URLs.

Rollback: redeploy the previous compatible app/browser images. Recipes with
`quiescent` completion need the new executor; older recipes keep working on
both. Configuration and encrypted state remain in existing additive tables.

## Verification

- `e2e/evals/web-app-autoteach.contract.ts`: one-click teaching of a closed
  iframe widget with a Stop button (live frames, launcher learned, test,
  replay), unattended detection of an SSE-streamed reply with no visible
  signal and hashed classes, a rich-text composer sending on Enter with
  typing dots, a cookie dialog covering a floating-avatar launcher (declined
  in every fresh session), a launcher that navigates away (undone), and
  Connect again from a conversation URL. The
  first three assistants echo the question.
- `tests/evals/website-run-resilience-db.test.ts`: retries in a fresh browser,
  a run that keeps going past one failing test, the systematic pause with its
  repair check, resume, and finishing with the captured answers.
- `e2e/evals/web-app-fixture.contract.ts`: batched human input, popup SSO,
  manual Fix of each part in nested frames, encrypted-state reuse and
  normalized eval execution.
- `e2e/evals/browser-fixture.contract.ts`: streaming pauses, selector drift,
  blocked HTTP/private WebSocket egress, and a basic chatbot that echoes the
  question into a shared bubble class, splits its reply, offers buttons and is
  followed through the matching one.
- `tests/evals/web-capture-v2.test.ts`: turn diffing, echo filtering and the
  guided-action choice.
- `tests/evals/browser-control-security.test.ts`: encryption, stream line
  sealing, bounded commands and input batches.
- `e2e/evals/ui.contract.ts`: the studio with a mocked stream: live canvas,
  input, one-click teach, failure copy, success commit, marks and Fix.
