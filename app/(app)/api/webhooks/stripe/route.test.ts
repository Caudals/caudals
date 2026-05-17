import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getStripeServerMock, queryRowsMock, logErrorMock, logInfoMock } =
  vi.hoisted(() => ({
    getStripeServerMock: vi.fn(),
    queryRowsMock: vi.fn(),
    logErrorMock: vi.fn(),
    logInfoMock: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({
  queryRows: queryRowsMock,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripeServer: getStripeServerMock,
}));

vi.mock("@/lib/security/structured-logger", () => ({
  logError: logErrorMock,
  logInfo: logInfoMock,
}));

import {
  markStripeWebhookEventFailed,
  markStripeWebhookEventProcessed,
  reserveStripeWebhookEvent,
} from "@/lib/stripe/webhook-replay-guard";
import { POST } from "@/app/(app)/api/webhooks/stripe/route";

function createStripeEvent(overrides: Partial<{ id: string; type: string }> = {}) {
  return {
    id: overrides.id ?? "evt_123",
    type: overrides.type ?? "payment_intent.succeeded",
    data: { object: { id: "pi_123" } },
  } as any;
}

function createRequest(body = "{}") {
  return new NextRequest("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: {
      "stripe-signature": "sig_test",
    },
  });
}

const tempDirs: string[] = [];

function writeTempSecret(name: string, value: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "caudals-stripe-secret-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  writeFileSync(filePath, value, "utf8");
  return filePath;
}

describe("stripe webhook replay guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRowsMock.mockReset();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    delete process.env.STRIPE_SECRET_KEY_FILE;
    delete process.env.STRIPE_WEBHOOK_SECRET_FILE;
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("reserves a new event for processing", async () => {
    queryRowsMock.mockResolvedValueOnce([{ processing_state: "processing" }]);

    const result = await reserveStripeWebhookEvent(createStripeEvent());

    expect(result).toEqual({
      shouldProcess: true,
      deduplicated: false,
      retrying: false,
    });
    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    expect(queryRowsMock.mock.calls[0]?.[0]).toContain(
      "INSERT INTO stripe_webhook_event"
    );
    expect(queryRowsMock.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(["evt_123", "payment_intent.succeeded"])
    );
  });

  it("deduplicates an already-processed event", async () => {
    queryRowsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ processing_state: "processed" }]);

    const result = await reserveStripeWebhookEvent(createStripeEvent());

    expect(result).toEqual({
      shouldProcess: false,
      deduplicated: true,
      retrying: false,
    });
    expect(queryRowsMock).toHaveBeenCalledTimes(2);
    expect(queryRowsMock.mock.calls[1]?.[0]).toContain(
      "SELECT processing_state"
    );
  });

  it("deduplicates an in-flight processing event unless the guarded retry wins", async () => {
    queryRowsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ processing_state: "processing" }])
      .mockResolvedValueOnce([]);

    const result = await reserveStripeWebhookEvent(createStripeEvent());

    expect(result).toEqual({
      shouldProcess: false,
      deduplicated: true,
      retrying: false,
    });
    expect(queryRowsMock).toHaveBeenCalledTimes(3);
    expect(queryRowsMock.mock.calls[2]?.[0]).toContain(
      "received_at < now()"
    );
  });

  it("retries a previously failed event", async () => {
    queryRowsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ processing_state: "failed" }])
      .mockResolvedValueOnce([{ processing_state: "processing" }]);

    const result = await reserveStripeWebhookEvent(
      createStripeEvent({ id: "evt_failed", type: "transfer.created" })
    );

    expect(result).toEqual({
      shouldProcess: true,
      deduplicated: false,
      retrying: true,
    });
    expect(queryRowsMock).toHaveBeenCalledTimes(3);
    expect(queryRowsMock.mock.calls[2]?.[0]).toContain(
      "UPDATE stripe_webhook_event"
    );
  });

  it("marks events processed after successful handling", async () => {
    queryRowsMock.mockResolvedValueOnce([{ stripe_event_id: "evt_done" }]);

    await markStripeWebhookEventProcessed("evt_done");

    expect(queryRowsMock).toHaveBeenCalledTimes(1);
    expect(queryRowsMock.mock.calls[0]?.[0]).toContain(
      "processing_state = 'processed'"
    );
    expect(queryRowsMock.mock.calls[0]?.[1]).toEqual(["evt_done"]);
  });

  it("records failed events without surfacing update failures", async () => {
    queryRowsMock.mockRejectedValueOnce(new Error("database unavailable"));

    await markStripeWebhookEventFailed("evt_failed", "Handler failed");

    expect(logErrorMock).toHaveBeenCalledWith(
      "stripe.webhook.mark_failed_error",
      expect.objectContaining({ eventId: "evt_failed" })
    );
  });

  it("verifies and persists a signed webhook request", async () => {
    const event = createStripeEvent({ id: "evt_post" });
    getStripeServerMock.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => event),
      },
    });
    queryRowsMock
      .mockResolvedValueOnce([{ processing_state: "processing" }])
      .mockResolvedValueOnce([{ stripe_event_id: "evt_post" }]);

    const response = await POST(createRequest(JSON.stringify(event)));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ received: true });
    expect(getStripeServerMock().webhooks.constructEvent).toHaveBeenCalledWith(
      JSON.stringify(event),
      "sig_test",
      "whsec_test_123"
    );
    expect(logInfoMock).toHaveBeenCalledWith(
      "stripe.webhook.accepted_phase_1",
      expect.objectContaining({
        eventId: "evt_post",
        eventType: "payment_intent.succeeded",
      })
    );
  });

  it("reads Stripe webhook secrets from mounted secret files", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY_FILE = writeTempSecret(
      "secret-key",
      "sk_test_file\n"
    );
    process.env.STRIPE_WEBHOOK_SECRET_FILE = writeTempSecret(
      "webhook-secret",
      "whsec_file\n"
    );
    const event = createStripeEvent({ id: "evt_file" });
    getStripeServerMock.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => event),
      },
    });
    queryRowsMock
      .mockResolvedValueOnce([{ processing_state: "processing" }])
      .mockResolvedValueOnce([{ stripe_event_id: "evt_file" }]);

    const response = await POST(createRequest(JSON.stringify(event)));

    expect(response.status).toBe(200);
    expect(getStripeServerMock().webhooks.constructEvent).toHaveBeenCalledWith(
      JSON.stringify(event),
      "sig_test",
      "whsec_file"
    );
  });

  it("rejects webhook requests when Stripe is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Stripe not configured" });
    expect(getStripeServerMock).not.toHaveBeenCalled();
  });
});
