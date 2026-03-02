# Role Workflow Spec

## Requester Workflow
1. Create dataset request.
2. Await admin approval.
3. Fund request.
4. Receive and review submissions.
5. Export approved dataset artifacts.

## Contributor Workflow
1. Discover funded opportunities.
2. Upload and submit data.
3. Receive review feedback.
4. Resolve `needs_changes` where applicable.
5. Track payout progression.

## Admin Workflow
1. Moderate requests/submissions.
2. Monitor payout and risk queues.
3. Resolve support and operational incidents.
4. Maintain platform trust and compliance posture.

## Workflow Guarantees
- Role boundaries are strict.
- State transitions are auditable.
- Payment-affecting events are idempotent.
