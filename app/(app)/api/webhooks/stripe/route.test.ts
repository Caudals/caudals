import { describe, expect, it, vi } from "vitest";
import {
  handlePaymentIntentSucceeded,
  handleTransferCreated,
  markStripeWebhookEventProcessed,
  reserveStripeWebhookEvent,
} from "@/app/(app)/api/webhooks/stripe/route";

type BuilderConfig = {
  awaitResult?: {
    data?: unknown;
    error?: { message: string; code?: string } | null;
    count?: number | null;
  };
  singleResult?: { data?: unknown; error?: { message: string; code?: string } | null };
  maybeSingleResult?: { data?: unknown; error?: { message: string; code?: string } | null };
};

function createBuilder(config: BuilderConfig = {}) {
  const awaitResult = config.awaitResult ?? { data: null, error: null };
  const builder: any = {};

  const chainMethods = [
    "select",
    "eq",
    "in",
    "order",
    "range",
    "limit",
    "gte",
    "lte",
    "or",
    "update",
    "insert",
    "delete",
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }

  builder.single = vi.fn(async () => config.singleResult ?? awaitResult);
  builder.maybeSingle = vi.fn(async () => config.maybeSingleResult ?? awaitResult);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(awaitResult).then(resolve, reject);

  return builder;
}

describe("stripe webhook idempotency", () => {
  it("skips payment_intent processing when transaction already exists", async () => {
    const existingTxBuilder = createBuilder({
      maybeSingleResult: {
        data: { id: "tx_existing_1" },
        error: null,
      },
    });
    const adminClient = {
      from: vi.fn((_table: string) => existingTxBuilder),
    };

    const event = {
      data: {
        object: {
          id: "pi_123",
          metadata: {
            user_id: "user_1",
            type: "wallet_deposit",
          },
          amount_received: 5000,
          amount: 5000,
          currency: "usd",
        },
      },
    };

    await handlePaymentIntentSucceeded(event as any, adminClient as any);

    expect(adminClient.from).toHaveBeenCalledTimes(1);
    expect(adminClient.from).toHaveBeenCalledWith("transactions");
    expect(existingTxBuilder.insert).not.toHaveBeenCalled();
  });

  it("skips transfer.created processing when payout transaction already exists", async () => {
    const accountLookupBuilder = createBuilder({
      singleResult: {
        data: {
          user_id: "user_2",
          default_currency: "usd",
          stripe_account_id: "acct_123",
        },
        error: null,
      },
    });
    const existingTxBuilder = createBuilder({
      maybeSingleResult: {
        data: { id: "tx_existing_2" },
        error: null,
      },
    });

    const queue = [accountLookupBuilder, existingTxBuilder];
    const adminClient = {
      from: vi.fn((_table: string) => {
        const next = queue.shift();
        if (!next) {
          throw new Error("Unexpected query call");
        }
        return next;
      }),
    };

    const event = {
      data: {
        object: {
          id: "tr_123",
          destination: "acct_123",
          amount: 4500,
          currency: "usd",
          metadata: {},
        },
      },
    };

    await handleTransferCreated(event as any, adminClient as any);

    expect(adminClient.from).toHaveBeenCalledTimes(2);
    expect(accountLookupBuilder.insert).not.toHaveBeenCalled();
    expect(existingTxBuilder.insert).not.toHaveBeenCalled();
  });
});

describe("stripe webhook replay guard", () => {
  it("deduplicates an already-processed webhook event", async () => {
    const duplicateInsertBuilder = createBuilder({
      awaitResult: {
        data: null,
        error: { message: "duplicate key value violates unique constraint", code: "23505" },
      },
    });
    const processedLookupBuilder = createBuilder({
      maybeSingleResult: {
        data: { processing_state: "processed" },
        error: null,
      },
    });

    const queue = [duplicateInsertBuilder, processedLookupBuilder];
    const adminClient = {
      from: vi.fn((_table: string) => {
        const next = queue.shift();
        if (!next) {
          throw new Error("Unexpected query call");
        }
        return next;
      }),
    };

    const result = await reserveStripeWebhookEvent(
      { id: "evt_1", type: "payment_intent.succeeded" } as any,
      adminClient as any
    );

    expect(result).toEqual({
      shouldProcess: false,
      deduplicated: true,
      retrying: false,
    });
  });

  it("retries processing for previously failed webhook events", async () => {
    const duplicateInsertBuilder = createBuilder({
      awaitResult: {
        data: null,
        error: { message: "duplicate key value violates unique constraint", code: "23505" },
      },
    });
    const failedLookupBuilder = createBuilder({
      maybeSingleResult: {
        data: { processing_state: "failed" },
        error: null,
      },
    });
    const retryUpdateBuilder = createBuilder({
      awaitResult: {
        data: null,
        error: null,
      },
    });

    const queue = [duplicateInsertBuilder, failedLookupBuilder, retryUpdateBuilder];
    const adminClient = {
      from: vi.fn((_table: string) => {
        const next = queue.shift();
        if (!next) {
          throw new Error("Unexpected query call");
        }
        return next;
      }),
    };

    const result = await reserveStripeWebhookEvent(
      { id: "evt_2", type: "transfer.created" } as any,
      adminClient as any
    );

    expect(result).toEqual({
      shouldProcess: true,
      deduplicated: false,
      retrying: true,
    });
  });

  it("marks webhook events as processed after successful handling", async () => {
    const updateBuilder = createBuilder({
      awaitResult: {
        data: null,
        error: null,
      },
    });
    const adminClient = {
      from: vi.fn((_table: string) => updateBuilder),
    };

    await markStripeWebhookEventProcessed("evt_done", adminClient as any);

    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        processing_state: "processed",
        last_error: null,
      })
    );
    expect(updateBuilder.eq).toHaveBeenCalledWith("stripe_event_id", "evt_done");
  });
});
