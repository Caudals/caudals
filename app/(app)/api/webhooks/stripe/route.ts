import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeServer } from "@/lib/stripe/server";
import {
  ensureStripeCustomerForUser,
  ensureWalletRecord,
  syncWalletFromConnectAccount,
  syncWalletFromCustomer,
  getDatasetBudgetSummary,
} from "@/lib/actions/payment-actions";
import { deriveDatasetStatus } from "@/lib/utils/dataset-status";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import { logError, logInfo, logWarn } from "@/lib/security/structured-logger";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
type TransactionUpdate = Database["public"]["Tables"]["transactions"]["Update"];
type StripeAccountUpdate = Database["public"]["Tables"]["stripe_accounts"]["Update"];
type DatasetUpdate = Database["public"]["Tables"]["dataset_requests"]["Update"];
type WebhookProcessingState = "processing" | "processed" | "failed";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripeEventHandlers: Record<
  string,
  (
    event: Stripe.Event,
    admin: ReturnType<typeof createAdminClient>
  ) => Promise<void>
> = {
  "payment_intent.succeeded": handlePaymentIntentSucceeded,
  "payment_intent.payment_failed": handlePaymentIntentFailed,
  "account.updated": handleAccountUpdated,
  "transfer.created": handleTransferCreated,
  "transfer.failed": handleTransferFailed,
};

function ensureStripeConfigured(): string {
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    throw new Error("Stripe webhook secret or API key missing");
  }

  return webhookSecret;
}

function centsToDollars(cents: number) {
  return Number(cents ?? 0) / 100;
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const code = "code" in error ? String(error.code ?? "") : "";
  if (code === "23505") return true;

  const message = "message" in error ? String(error.message ?? "") : "";
  return message.toLowerCase().includes("duplicate key");
}

export async function reserveStripeWebhookEvent(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
): Promise<{ shouldProcess: boolean; deduplicated: boolean; retrying: boolean }> {
  const adminClient = admin as any;

  const payload = {
    stripe_event_id: event.id,
    event_type: event.type,
    processing_state: "processing" as WebhookProcessingState,
    payload: event as unknown as Json,
    received_at: new Date().toISOString(),
    processed_at: null,
    last_error: null,
  };

  const { error: insertError } = await adminClient
    .from("stripe_webhook_events")
    .insert(payload);

  if (!insertError) {
    return { shouldProcess: true, deduplicated: false, retrying: false };
  }

  if (!isUniqueViolation(insertError)) {
    throw new Error(
      `Failed to reserve Stripe webhook event ${event.id}: ${insertError.message ?? "unknown error"}`
    );
  }

  const { data: existing, error: existingError } = await adminClient
    .from("stripe_webhook_events")
    .select("processing_state")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Failed to check Stripe webhook event ${event.id}: ${existingError.message ?? "unknown error"}`
    );
  }

  const state = (existing?.processing_state ?? "processed") as WebhookProcessingState;

  if (state !== "failed") {
    return { shouldProcess: false, deduplicated: true, retrying: false };
  }

  const { error: retryError } = await adminClient
    .from("stripe_webhook_events")
    .update({
      processing_state: "processing",
      received_at: new Date().toISOString(),
      processed_at: null,
      last_error: null,
      event_type: event.type,
      payload: event as unknown as Json,
    })
    .eq("stripe_event_id", event.id)
    .eq("processing_state", "failed");

  if (retryError) {
    throw new Error(
      `Failed to retry Stripe webhook event ${event.id}: ${retryError.message ?? "unknown error"}`
    );
  }

  return { shouldProcess: true, deduplicated: false, retrying: true };
}

export async function markStripeWebhookEventProcessed(
  eventId: string,
  admin: ReturnType<typeof createAdminClient>
) {
  const adminClient = admin as any;

  const { error } = await adminClient
    .from("stripe_webhook_events")
    .update({
      processing_state: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("stripe_event_id", eventId);

  if (error) {
    throw new Error(
      `Failed to mark Stripe webhook event ${eventId} as processed: ${error.message ?? "unknown error"}`
    );
  }
}

export async function markStripeWebhookEventFailed(
  eventId: string,
  message: string,
  admin: ReturnType<typeof createAdminClient>
) {
  const adminClient = admin as any;

  const { error } = await adminClient
    .from("stripe_webhook_events")
    .update({
      processing_state: "failed",
      last_error: message,
    })
    .eq("stripe_event_id", eventId);

  if (error) {
    logError("Failed to mark Stripe webhook event as failed", {
      eventId,
      error,
    });
  }
}

export async function POST(request: NextRequest) {
  let secret: string;

  try {
    secret = ensureStripeConfigured();
  } catch (error) {
    logError("stripe.webhook.config_missing", { error });
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();
  const stripe = getStripeServer();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid webhook signature";
    logError("Webhook signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient("stripe_webhooks");

  try {
    const reservation = await reserveStripeWebhookEvent(event, admin);

    if (!reservation.shouldProcess) {
      return NextResponse.json({ received: true, deduplicated: true });
    }

    const handler = stripeEventHandlers[event.type];

    if (handler) {
      await handler(event, admin);
    } else {
      logInfo(`Unhandled Stripe event type: ${event.type}`);
    }

    await markStripeWebhookEventProcessed(event.id, admin);

    return NextResponse.json({ received: true });
  } catch (error) {
    logError("Error processing Stripe webhook:", error);
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    await markStripeWebhookEventFailed(event.id, message, admin);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const adminClient = admin as any;
  const metadata = paymentIntent.metadata ?? {};
  const userId = metadata.user_id;
  const datasetId = metadata.dataset_id;
  const paymentType = metadata.type;

  const { data: existingTx } = await adminClient
    .from("transactions")
    .select("id")
    .eq("reference_id", paymentIntent.id)
    .maybeSingle();

  if (existingTx) {
    logInfo(
      `Transaction already recorded for payment intent ${paymentIntent.id}, skipping`
    );
    return;
  }

  if (!userId || !paymentType) {
    logWarn(
      "PaymentIntent succeeded without user or type metadata",
      paymentIntent.id
    );
    return;
  }

  const amountReceived =
    paymentIntent.amount_received ?? paymentIntent.amount ?? 0;
  const currency = paymentIntent.currency ?? "usd";

  if (paymentType === "wallet_deposit") {
    const payload: TransactionInsert = {
      user_id: userId,
      direction: "credit",
      type: "wallet_deposit",
      amount: amountReceived,
      currency,
      status: "completed",
      reference_id: paymentIntent.id,
      source_type: "stripe",
      metadata: metadata as Json,
    };

    const { error: insertError } = await adminClient
      .from("transactions")
      .insert(payload);

    if (insertError) {
      logError("Error inserting wallet deposit transaction", insertError);
    }

    if (typeof paymentIntent.customer === "string") {
      try {
        const stripe = getStripeServer();
        const { customerId, wallet } = await ensureStripeCustomerForUser(
          stripe,
          admin,
          userId,
          paymentIntent.receipt_email ?? undefined,
          undefined
        );

        await syncWalletFromCustomer(
          stripe,
          admin,
          wallet,
          customerId
        );
      } catch (syncError) {
        logError("Failed to sync wallet after deposit", syncError);
      }
    }

    return;
  }

  if (paymentType === "dataset_funding") {
    if (!datasetId) {
      logError(
        "Dataset funding payment missing dataset_id metadata",
        paymentIntent.id
      );
      return;
    }

    const budgetSummary = await getDatasetBudgetSummary(datasetId, admin);
    if (budgetSummary.error || !budgetSummary.data) {
      logError("Failed to load dataset budget", budgetSummary.error);
      return;
    }

    const {
      totalBudgetCents,
      fundedCents,
      remainingForFundingCents,
      approvalStatus,
    } = budgetSummary.data;

    if (totalBudgetCents <= 0) {
      logError("Dataset has no total budget set; rejecting funding");
      return;
    }

    if (remainingForFundingCents <= 0) {
      logInfo("Dataset already fully funded; skipping extra payment");
      return;
    }

    const amountToApply = Math.min(amountReceived, remainingForFundingCents);

    const payload: TransactionInsert = {
      user_id: userId,
      direction: "debit",
      type: "dataset_funding",
      amount: amountToApply,
      currency,
      status: "completed",
      reference_id: paymentIntent.id,
      dataset_request_id: datasetId,
      source_type: "stripe",
      metadata: metadata as Json,
    };

    const { error: txError } = await adminClient
      .from("transactions")
      .insert(payload);

    if (txError) {
      logError("Failed to record dataset funding transaction", txError);
    }

    if (typeof paymentIntent.customer === "string") {
      try {
        const stripe = getStripeServer();
        const { customerId, wallet } = await ensureStripeCustomerForUser(
          stripe,
          admin,
          userId,
          paymentIntent.receipt_email ?? undefined,
          undefined
        );

        await syncWalletFromCustomer(
          stripe,
          admin,
          wallet,
          customerId
        );
      } catch (syncError) {
        logError("Failed to sync wallet after dataset funding", syncError);
      }
    }

    const { data: existingDataset, error: datasetLookupError } =
      await adminClient
        .from("dataset_requests")
        .select("paid_amount, total_budget")
        .eq("id", datasetId)
        .single();

    if (datasetLookupError) {
      logError(
        "Failed to load dataset for payment update",
        {
          datasetId,
          error: datasetLookupError,
        }
      );
    }

    const newFundedCents = fundedCents + amountToApply;
    const totalBudget = Number(existingDataset?.total_budget ?? 0) || null;
    const newPaidAmount =
      totalBudget && Number.isFinite(totalBudget)
        ? Math.min(totalBudget, centsToDollars(newFundedCents))
        : centsToDollars(newFundedCents);
    const nextStatus =
      totalBudget && Number.isFinite(totalBudget)
        ? newFundedCents >= totalBudgetCents
          ? "paid"
          : "partial"
        : "partial";

    const datasetUpdate: DatasetUpdate = {
      payment_status: nextStatus,
      paid_amount: newPaidAmount,
      stripe_payment_intent_id: paymentIntent.id,
      status: deriveDatasetStatus(approvalStatus, nextStatus),
    };

    const { error: datasetUpdateError } = await adminClient
      .from("dataset_requests")
      .update(datasetUpdate)
      .eq("id", datasetId);

    if (datasetUpdateError) {
      logError("Failed to update dataset request after funding", {
        datasetId,
        datasetUpdateError,
      });
    }
  }
}

async function handlePaymentIntentFailed(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const adminClient = admin as any;
  const metadata = paymentIntent.metadata ?? {};
  const userId = metadata.user_id;
  const datasetId = metadata.dataset_id;
  const paymentType = metadata.type;

  if (!userId || !paymentType) {
    return;
  }

  const failedPayload: TransactionInsert = {
    user_id: userId,
    direction: paymentType === "wallet_deposit" ? "credit" : "debit",
    type:
      paymentType === "wallet_deposit" ? "wallet_deposit" : "dataset_funding",
    amount: paymentIntent.amount ?? 0,
    currency: paymentIntent.currency ?? "usd",
    status: "failed",
    reference_id: paymentIntent.id,
    dataset_request_id:
      paymentType === "dataset_funding" ? datasetId ?? null : null,
    source_type: "stripe",
    metadata: {
      ...metadata,
      failure_reason: paymentIntent.last_payment_error?.message,
    } as Json,
  };

  const { error: txError } = await adminClient
    .from("transactions")
    .insert(failedPayload);

  if (txError) {
    logError("Failed to record failed payment transaction", txError);
  }

  if (paymentType === "dataset_funding" && datasetId) {
    const datasetUpdate: DatasetUpdate = {
      payment_status: "unpaid",
    };

    const { error } = await adminClient
      .from("dataset_requests")
      .update(datasetUpdate)
      .eq("id", datasetId);

    if (error) {
      logError("Failed to update dataset after failed payment", error);
    }
  }
}

async function handleAccountUpdated(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const stripe = getStripeServer();
  let account = event.data.object as Stripe.Account;
  const adminClient = admin as any;

  if (!account.external_accounts?.data?.length) {
    try {
      account = await stripe.accounts.retrieve(account.id, {
        expand: ["external_accounts"],
      });
    } catch (error) {
      logWarn(
        "Unable to expand external accounts for account update webhook",
        error
      );
    }
  }

  const bankAccount = account.external_accounts?.data?.find(
    (external) => external.object === "bank_account"
  ) as Stripe.BankAccount | undefined;

  const bankLast4 = bankAccount?.last4 ?? null;
  const bankStatus = bankAccount?.status ?? null;

  const updatePayload: StripeAccountUpdate = {
    status: account.details_submitted
      ? account.charges_enabled && account.payouts_enabled
        ? "active"
        : "restricted"
      : "pending",
    charges_enabled: account.charges_enabled ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
    details_submitted: account.details_submitted ?? false,
    requirements_currently_due: (account.requirements?.currently_due ?? []) as Json,
    requirements_past_due: (account.requirements?.past_due ?? []) as Json,
    requirements_disabled_reason: account.requirements?.disabled_reason ?? null,
    bank_last4: bankLast4,
    bank_status: bankStatus,
    last_synced_at: new Date().toISOString(),
  };

  const { error } = await adminClient
    .from("stripe_accounts")
    .update(updatePayload)
    .eq("stripe_account_id", account.id);

  if (error) {
    logError("Failed to update Stripe account record", error);
  }
}

export async function handleTransferCreated(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const transfer = event.data.object as Stripe.Transfer;
  const adminClient = admin as any;

  if (!transfer.destination) {
    logError("Transfer missing destination account", transfer.id);
    return;
  }

  const { data: stripeAccount, error: accountLookupError } = await adminClient
    .from("stripe_accounts")
    .select("user_id, default_currency, stripe_account_id")
    .eq("stripe_account_id", transfer.destination)
    .single();

  if (accountLookupError || !stripeAccount) {
    logError("No user found for transfer destination", transfer.destination);
    return;
  }

  const { data: existingTransaction } = await adminClient
    .from("transactions")
    .select("id")
    .eq("reference_id", transfer.id)
    .maybeSingle();

  if (existingTransaction) {
    logInfo(
      `Transaction already recorded for transfer ${transfer.id}, skipping`
    );
    return;
  }

  const metadata = transfer.metadata ?? {};

  const payoutPayload: TransactionInsert = {
    user_id: stripeAccount.user_id,
    direction: "credit",
    type: "submission_payout",
    amount: transfer.amount,
    currency: transfer.currency ?? "usd",
    status: "completed",
    reference_id: transfer.id,
    dataset_request_id: (metadata.dataset_id as string | undefined) ?? null,
    submission_id: (metadata.submission_id as string | undefined) ?? null,
    source_type: "stripe",
    metadata: metadata as Json,
  };

  const { error: insertError } = await adminClient
    .from("transactions")
    .insert(payoutPayload);

  if (insertError) {
    logError("Failed to insert transfer transaction", insertError);
  }

  if (
    stripeAccount?.user_id &&
    typeof transfer.destination === "string" &&
    transfer.destination
  ) {
    try {
      const stripe = getStripeServer();
      const wallet = await ensureWalletRecord(admin, stripeAccount.user_id);
      await syncWalletFromConnectAccount(
        stripe,
        admin,
        wallet,
        transfer.destination,
        stripeAccount.default_currency ?? transfer.currency
      );
    } catch (syncError) {
      logError("Failed to sync wallet after transfer", syncError);
    }
  }
}

async function handleTransferFailed(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const transfer = event.data.object as Stripe.Transfer;
  const adminClient = admin as any;

  if (!transfer.destination) {
    return;
  }

  const updatePayload: TransactionUpdate = {
    status: "failed",
    metadata: {
      ...transfer.metadata,
      transfer_status: (transfer as any).status ?? "failed",
    } as Json,
  };

  const { error: updateError } = await adminClient
    .from("transactions")
    .update(updatePayload)
    .eq("reference_id", transfer.id);

  if (updateError) {
    logError("Failed to flag transfer as failed", updateError);
  }
}
