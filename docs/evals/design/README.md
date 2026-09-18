# WP-01 UI handoff

Implemented only in `app/(evaluation)`, `components/evals`, `lib/evals/messages`, `e2e/evals`, and this directory. No commits, auth/domain/proxy/schema edits or full builds were performed by the UI agent.

## Working routes

- `/evaluation-entry`: authenticated platform-role redirect. Operators/admins land at `/ops`; members at `/workspace/evaluations`; users without memberships at invitations.
- `/ops`: server-gated operator client creation, visible acting identity and selected client, workspace listing, scoped invitation listing, creation and revocation. Workspace creation creates no account. Invitation creation exposes a private link only when the API returns its one-time token; it sends no email.
- `/workspace/evaluations`: identity-scoped workspace selection and truthful empty state. No simulated evaluations or dead navigation.
- `/workspace/invitations`: outside the authenticated guard. Signed-in users accept tokens; unsigned users can enroll through the parent's invitation enrollment endpoint or follow evaluation sign-in with an encoded return path. Tokens are removed from the visible URL after hydration and are not written to browser storage. Metadata sets no-referrer and noindex.

- `/workspace/sign-in`: dedicated English password sign-in and in-place TOTP challenge with retry/restart, accessible code focus, and invite-aware return paths.
- `/workspace/reset-password`: recovery request, neutral account-existence response, token-based password update, matching confirmation, expired-link handling and return to sign-in.

Evaluation auth uses a scoped **real Better Auth SDK client** in `components/evals/auth-client.ts`, the same `/api/auth` endpoint and cookies as the legacy client. The shared singleton's two-factor plugin unconditionally redirects to `/auth/sign-in`, so the evaluation instance handles the challenge locally and disables SDK response-URL redirects. It navigates only to `safeRedirectPath`-validated, implemented evaluation destinations; auth-loop and legacy destinations fall back to `/evaluation-entry`. No fake auth implementation or auth backend changes were introduced. Legacy auth pages remain unchanged by this slice. Parent owns app-host gating, English root layout and analytics exclusion. Server page helpers catch `EvalError(SESSION_REQUIRED)`; API expiry renders sign-in/recovery links. Invitation recovery preserves the invitation return path.

API mutations use the agreed envelopes. Workspace and invitation creation send UUID Idempotency-Key headers, reused after a lost response for the same form input. Revocation includes `?orgId=`. Enrollment sends `{token,name,password}`; names/passwords follow the parent's 120/12–128 limits. The UI does not implement authorization, enrollment verification, or database identity itself.

## Design review and references

The installed frontend-design skill was read at `/home/caudals/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`. Actual Claude CLI was invoked. A first bounded reference-gathering run exhausted six turns. A second one-turn, no-tools invocation received the collected spec, skill and official-reference context and returned [the raw proposal](claude-proposal.md). This is proposal evidence, not an approved specification.

Reviewed official references on 2026-09-17:

- [ElevenLabs Analytics](https://elevenlabs.io/docs/eleven-agents/dashboard): compact filters, quiet work surface, overview leading into contextual detail. Its publicly embedded dashboard screenshot was reviewed in the captured [official page reference](elevenlabs-official-reference.png).
- [ElevenLabs Agent Testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing): separate scenario definition, expected behavior and result inspection. Direct fetching of one embedded image timed out; no authenticated dashboard access is claimed.

Accepted: compact 240px desktop sidebar, 56px context bar, bounded content widths, horizontal table dividers, mobile drawer, text status, honest empty states. Rejected: Claude's dark sidebar, Settings link, fabricated metrics, unsupported invitation roles/decline controls, and links to future functionality. The implementation uses actual repository `--ds-*` tokens, not invented ElevenLabs tokens or measured reference CSS. Existing production tokens currently render a warmer canvas than the DESIGN.md sample table; this slice does not override them.

## Artifacts

- [Future connection, progress and report reference](future-reference.html) and [image](future-reference.png): static, explicitly fictional future design; no route, live progress or functionality claims.
- [Operator desktop](operator-1440.png).
- [Evaluation sign-in at 390px](sign-in-390.png).
- Member empty state at [390px](workspace-390.png), [768px](workspace-768.png), [1440px](workspace-1440.png).

Screenshots use the actual React components and production CSS in the isolated browser harness with clearly synthetic identities. They do not demonstrate database isolation. Visual review found no horizontal overflow at the three target widths. Keyboard checks cover opening the mobile drawer, Escape dismissal and focus restoration. Native labels, status/alert regions, current-page semantics, skip navigation and reduced-motion overrides are included; no comprehensive WCAG certification is claimed.

## Validation

Run `npx playwright test --config=e2e/evals/ui.config.ts` for the isolated browser contract suite (one worker, ephemeral server on 4187, no Next build). `ui.contract.ts` intentionally avoids the repository's default `*.spec.ts` discovery because its Next navigation is stubbed and API responses are intercepted. Tests cover two clients, exact invitation payloads, idempotency, scoped revocation, expiry recovery, enrollment, acceptance, unavailable tokens and responsive navigation. Auth tests exercise the actual SDK with intercepted HTTP responses: password sign-in, TOTP failure/success without legacy redirects, return-path sanitization, recovery requests, password confirmation, invalid/reset tokens and switching to a fresh recovery request. Parent must separately validate host routing, real sign-in/session cookies, tenant authorization and actual enrollment against the database.

Final validation: **21 browser contract tests passed**, scoped ESLint passed, and full `tsc --noEmit --incremental false` passed. An earlier typecheck encountered missing landing dependencies (`lenis` and `three`); these were resolved by concurrent parent work before the final check. No dependency files were changed by this UI slice.


## Sign-out completion

Desktop sidebar and mobile navigation drawer include a visible Sign out button. Both call the scoped real `betterAuthClient.signOut()` POST endpoint, disable the action while pending, and replace the page with `/workspace/sign-in` only after success. Full navigation clears private client component state and the current route cache. Server/network failures keep the shell open, announce the failure, and permit retry. No legacy GET sign-out route is linked.

The isolated UI suite covers successful POST sign-out at 390/1440px and retry after both server and network failure. Parent reported successful actual runtime login, two-client creation, viewer cross-tenant denial, invitation enrollment/sign-in, and 390/768/1440 screenshots (`runtime*.png`). Parent owns the runtime E2E files; this completion changes only the isolated UI tests.
