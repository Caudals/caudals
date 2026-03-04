# Role Workflow Spec

## Workflow Guarantees
- Role boundaries are strict and enforced.
- State transitions are auditable.
- Payment-affecting events are idempotent.

## Requester Workflow
1. Create dataset request.
2. Await admin approval.
3. Fund request.
4. Receive and review submissions.
5. Export approved dataset artifacts.

Requester critical UX requirements:
- urgent review/funding work is visible first,
- export and support paths are one-click reachable,
- alerts map directly to actionable destinations.

## Contributor Workflow
1. Discover funded opportunities.
2. Upload and submit data.
3. Receive review feedback.
4. Resolve `needs_changes` where applicable.
5. Track payout progression.

Contributor critical UX requirements:
- action inbox is visible from dashboard,
- payout readiness/blockers are explicit,
- resubmission path is fast and obvious.

## Admin Workflow
1. Moderate requests and submissions.
2. Monitor payout/risk/support queues.
3. Resolve incidents and escalation paths.
4. Maintain trust/compliance posture.

Admin critical UX requirements:
- SLA queues are prioritized,
- anomaly signals are severity-ranked,
- high-risk actions are auditable.
