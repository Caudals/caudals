# Evaluation product implementation

The user authorized Stages A–C (WP-00–11) of `../product-specs/evals-platform-implementation-spec.md`. That specification controls the new evaluation product; the old three-paid-pilot prerequisite and old `/e`/`proof` architecture do not block this work.

Use `app/(evaluation)`, `/api/evals/v1`, `lib/evals`, the `evals` schema and separate workers. Evaluation UI is English using its own catalog; public marketing localization and `/admin` remain separate. No legacy marketplace or frozen infrastructure dependency. Stage C remains invite-only: do not enable broad registration.

Persist tenant identity server-side. `withTenant` checks a non-owner NOBYPASSRLS runtime role and uses transaction-local context. Identity grants are explicit, not inherited from legacy operators. Admin support reads are audited; workers use persisted job scope. Never make provider calls outside the reservation/attempt path.

The browser worker is a separate service and queue with a dedicated database role, explicit tenant allowlist, browser-session-only keyring and policy-enforced public HTTPS egress. Recipes are declarative and require two successful reset probes before freezing. CAPTCHA, selector drift, expired login state and incomplete capture enter assistance; never bypass them.

Multi-turn and tool cases use frozen scenario graphs and simulated deterministic fixtures. Model output never grants network, filesystem, secret, publication or spend authority. Customer run creation is bounded by server-side workspace entitlements; runtime users cannot raise them.

Develop in an isolated VPS worktree, disposable DB/storage and loopback preview. Production deployment is a separate operation. Keep migrations additive with forward-repair rollback guidance. Tests must establish tenant isolation and failure recovery, not merely successful rendering. Current status and remaining live release evidence are in `work-packages/WP-08.md` through `WP-13.md`.
