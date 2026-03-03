# Tech Debt Tracker

## Status Legend
- `OPEN`: not started
- `PLANNED`: scheduled in an active phase
- `RESOLVED`: completed and verified

## Debt Queue
| ID | Area | Debt | Impact | Priority | Target Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TD-001 | API abuse controls | In-memory limiter should move to durable distributed store | multi-instance inconsistency risk | P1 | Phase 14 | RESOLVED |
| TD-002 | Export lifecycle | Export orchestration still relies on app-request path; needs durable worker queue | reliability under heavy load | P0 | Phase 14 | RESOLVED |
| TD-003 | Observability | Missing unified dashboard for webhook + payout anomaly correlation | slower incident triage | P1 | Phase 15 | RESOLVED |
| TD-004 | Test isolation | Role E2E fixtures need periodic automatic freshness checks | flaky acceptance checks risk | P1 | Phase 14 | RESOLVED |
| TD-005 | Localization QA | EN/ES coverage should include automated missing-key guardrail in CI | regression risk in new pages | P2 | Phase 14 | RESOLVED |
| TD-006 | Requester funding UX | Funding backend exists but production requester card-funding entrypoints are incomplete | blocked monetization / conversion drop | P0 | Phase 15 | RESOLVED |
| TD-007 | Billing history completeness | Requester billing artifacts lack receipt/reference-grade context for finance support | manual support load and slower dispute resolution | P1 | Phase 15 | RESOLVED |
| TD-008 | Payout lifecycle resilience | Transfer/webhook variance handling and payout failure states need deeper hardening | payout inconsistency risk | P0 | Phase 15 | RESOLVED |
| TD-009 | Payment operations risk tooling | Admin anomaly correlation and reconciliation ergonomics are incomplete | slower incident containment | P1 | Phase 15 | RESOLVED |
| TD-010 | Migration drift guardrails | Self-hosted DB lacks `023_stripe_webhook_events` despite code expecting it; add migration-drift detection + repair runbook | webhook dedupe disabled fallback, reduced replay protection | P0 | Phase 15 | RESOLVED |

## Update Rules
- Add debt when tradeoffs are intentional and unresolved.
- Close debt only with linked validation evidence in logs.
