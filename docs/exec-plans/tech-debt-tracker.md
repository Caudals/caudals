# Tech Debt Tracker

## Status Legend
- `OPEN`: not started
- `PLANNED`: scheduled in an active phase
- `RESOLVED`: completed and verified

## Debt Queue
| ID | Area | Debt | Impact | Priority | Target Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TD-001 | API abuse controls | In-memory limiter should move to durable distributed store | multi-instance inconsistency risk | P1 | Phase 12 | OPEN |
| TD-002 | Export lifecycle | Export orchestration still relies on app-request path; needs durable worker queue | reliability under heavy load | P0 | Phase 11 | PLANNED |
| TD-003 | Observability | Missing unified dashboard for webhook + payout anomaly correlation | slower incident triage | P1 | Phase 12 | OPEN |
| TD-004 | Test isolation | Role E2E fixtures need periodic automatic freshness checks | flaky acceptance checks risk | P1 | Phase 11 | PLANNED |
| TD-005 | Localization QA | EN/ES coverage should include automated missing-key guardrail in CI | regression risk in new pages | P2 | Phase 12 | OPEN |

## Update Rules
- Add debt when tradeoffs are intentional and unresolved.
- Close debt only with linked validation evidence in logs.
