# Web App Connector

Available from an evaluation's **Connect or repair your web app** section and
the website system panel. Workspace managers and assigned operators can open
it; viewers cannot access browser pixels or send input. The target must carry
a current website-testing attestation and be permitted by the browser worker's
workspace allowlist.

1. Enter the website URL when creating an evaluation.
2. Open Teach Mode. Choose **Take control** to sign in, complete SSO/2FA or
   CAPTCHA manually, navigate, paste text, scroll or drag. Popup tabs belong to
   the same isolated context and can be selected in the toolbar.
3. Choose **Teach Caudals**, choose an element and click it in the live browser.
   Teach the optional launcher, prompt input, Send and assistant response. If
   Send does not disable during generation, teach a loading indicator while it
   is visible. Every element has its own frame path, including nested frames
   and open shadow roots. The current selection gets a green outline.
4. **Save connector** saves an encrypted login and a reusable draft. It does
   not make an untested recipe eligible for an eval.
5. **Test Connection** loads fresh authenticated contexts, sends two distinct
   harmless prompts, checks reset and complete new replies, and probes a
   follow-up. Successful evidence freezes an immutable website recipe and
   target revision. Eval runs use the existing website adapter, observations,
   scoped attempt credentials and usage ledger.

Selection prefers unique test IDs, exact roles/accessibility names, labels and
stable attributes. Ambiguous or unstable elements require another selection;
no XPath, positional CSS or customer JavaScript is generated. Response
selection must identify assistant output, not a mixed user/assistant region.
Text stability alone never qualifies streaming as complete.

## Session and network lifecycle

The browser executor exposes an internal control listener on 8089. The
existing relay forwards only that fixed destination and PostgreSQL; there is
no published browser/debugger port and Chromium retains its restricted egress
network. The app uses `EVALS_BROWSER_CONTROL_URL` if set, otherwise
`http://caudals-evals-browser-db-relay:8089/control`.

Every request/response uses authenticated encryption with a purpose-derived
key from the browser-only mounted keyring. Request IDs, timestamps, direction,
workspace allowlist and actor/target binding are verified; replayed requests
are rejected. Input, pixels and raw session state never enter a database
command queue or logs. Customer API responses do not contain storage state.
Private snapshots are noncached and password inputs are masked.

Initially one interactive session is available per browser service. Idle
contexts expire after ten minutes; absolute lifetime is thirty minutes. Close,
navigation away, expiry and shutdown dispose of the context. Browser worker
restarts require reopening the interactive browser; saved configuration and
encrypted login survive. Source captures defer while an interactive session
is active. Existing bounded eval jobs retain their own isolated contexts.

Saved cookies, local storage, IndexedDB and session storage belong only to the
target and explicitly selected iframe origins. Identity-provider state is
discarded after sign-in. Encryption uses the existing target-scoped envelope
registry; only the browser executor decrypts saved state. Saved sessions expire
within seven days and can be revoked through the existing session UI. The
remote browser always uses fresh contexts for eval scenarios, preserving
conversation state only across turns of the same scenario.

## Repair and limitations

Expired login, selector ambiguity/drift, navigation failure and incomplete
streaming are operational failures. A browser eval with expired login,
selector failure or incomplete capture pauses its remaining work and marks
the connection as requiring assistance; partial answers are not graded.
Reopen the connector, sign in or reteach, test, cancel the paused run, and start
a new run with the new revision. Existing run plans are never rewritten.

This supports public HTTPS apps reachable through the existing egress policy.
Private network apps still use the private runner. Closed shadow roots,
hardware-bound authentication, sites blocking remote/headless Chromium, and
apps without a verifiable completion/reset signal require assistance rather
than an unreliable automated result. CAPTCHA and authentication are completed
by the customer, never bypassed. Clean hash routes are retained; auth query
parameters and unsafe fragments are discarded from saved navigation URLs.

Rollback: redeploy the previous compatible app/browser images. Configuration
and encrypted state remain in existing additive tables; do not delete recipes,
credentials or frozen run history. Revoke affected sessions if needed.

## Verification

`e2e/evals/web-app-fixture.contract.ts` exercises human control, popup login,
iframe teaching/highlighting, authenticated reset probes, state reuse and
normalized eval execution against a synthetic HTTPS app. Browser fixture tests
cover streaming pauses, selector drift and blocked HTTP/private WebSocket
egress. `tests/evals/browser-control-security.test.ts` covers encryption,
scope and bounded commands; `web-app-connectors-db.test.ts` verifies drafts,
immutable validated revisions, expiry and tenant isolation using a disposable
PostgreSQL database and the non-owner runtime role. The existing UI harness
exercises setup, save/test failure and repair controls.
