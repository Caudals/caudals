import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeServer } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
type TransactionUpdate = Database["public"]["Tables"]["transactions"]["Update"];
type StripeAccountUpdate = Database["public"]["Tables"]["stripe_accounts"]["Update"];
type DatasetUpdate = Database["public"]["Tables"]["dataset_requests"]["Update"];

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

export async function POST(request: NextRequest) {
  let secret: string;

  try {
    secret = ensureStripeConfigured();
  } catch (error) {
    console.error(error);
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
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const handler = stripeEventHandlers[event.type];

    if (handler) {
      await handler(event, admin);
    } else {
      console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing Stripe webhook:", error);
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;
  const metadata = paymentIntent.metadata ?? {};
  const userId = metadata.user_id;
  const datasetId = metadata.dataset_id;
  const paymentType = metadata.type;

  if (!userId || !paymentType) {
    console.warn(
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
      console.error("Error inserting wallet deposit transaction", insertError);
    }

    return;
  }

  if (paymentType === "dataset_funding") {
    if (!datasetId) {
      console.error(
        "Dataset funding payment missing dataset_id metadata",
        paymentIntent.id
      );
      return;
    }

    const payload: TransactionInsert = {
      user_id: userId,
      direction: "debit",
      type: "dataset_funding",
      amount: amountReceived,
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
      console.error("Failed to record dataset funding transaction", txError);
    }

    const datasetUpdate: DatasetUpdate = {
      payment_status: "paid",
      paid_amount: centsToDollars(amountReceived),
      stripe_payment_intent_id: paymentIntent.id,
    };

    const { error: datasetUpdateError } = await adminClient
      .from("dataset_requests")
      .update(datasetUpdate)
      .eq("id", datasetId);

    if (datasetUpdateError) {
      console.error("Failed to update dataset request after funding", {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    console.error("Failed to record failed payment transaction", txError);
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
      console.error("Failed to update dataset after failed payment", error);
    }
  }
}

async function handleAccountUpdated(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const account = event.data.object as Stripe.Account;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  const bankLast4 =
    account.external_accounts?.data?.[0]?.object === "bank_account"
      ? account.external_accounts.data[0].last4
      : null;

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
    last_synced_at: new Date().toISOString(),
  };

  const { error } = await adminClient
    .from("stripe_accounts")
    .update(updatePayload)
    .eq("stripe_account_id", account.id);

  if (error) {
    console.error("Failed to update Stripe account record", error);
  }
}

async function handleTransferCreated(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const transfer = event.data.object as Stripe.Transfer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  if (!transfer.destination) {
    console.error("Transfer missing destination account", transfer.id);
    return;
  }

  const { data: stripeAccount, error: accountLookupError } = await adminClient
    .from("stripe_accounts")
    .select("user_id")
    .eq("stripe_account_id", transfer.destination)
    .single();

  if (accountLookupError || !stripeAccount) {
    console.error("No user found for transfer destination", transfer.destination);
    return;
  }

  const { data: existingTransaction } = await adminClient
    .from("transactions")
    .select("id")
    .eq("reference_id", transfer.id)
    .maybeSingle();

  if (existingTransaction) {
    console.log(
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
    console.error("Failed to insert transfer transaction", insertError);
  }
}

async function handleTransferFailed(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>
) {
  const transfer = event.data.object as Stripe.Transfer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = admin as any;

  if (!transfer.destination) {
    return;
  }

  const updatePayload: TransactionUpdate = {
    status: "failed",
    metadata: {
      ...transfer.metadata,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transfer_status: (transfer as any).status ?? "failed",
    } as Json,
  };

  const { error: updateError } = await adminClient
    .from("transactions")
    .update(updatePayload)
    .eq("reference_id", transfer.id);

  if (updateError) {
    console.error("Failed to flag transfer as failed", updateError);
  }
}
