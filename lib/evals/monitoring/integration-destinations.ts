/**
 * Slack, Microsoft Teams and email destinations for scheduled-run summaries
 * (launch L-19, spec v2 P-25, P-28), registered on L-18's destination hook
 * (./destinations.ts). In the alert's transaction it only queues one delivery
 * per destination and event (./webhooks.ts, `queueSummaryDeliveries`); the
 * scheduler's webhook tick formats and sends them. Imported once by
 * ./alerts.ts, so the scheduler always has it.
 */
import { registerSummaryDestination } from "./destinations";
import { queueSummaryDeliveries } from "./webhooks";

registerSummaryDestination({
  kind: "integrations",
  async deliver(db, delivery) {
    await queueSummaryDeliveries(db, delivery.orgId, delivery.eventId, delivery.webhookEvent, delivery.summary);
  },
});
