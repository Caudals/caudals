import { NextRequest, NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  // Check if Stripe is configured
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event;

  try {
    const stripe = getStripeServer();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object, supabase);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object, supabase);
        break;

      case "account.updated":
        await handleAccountUpdated(event.data.object, supabase);
        break;

      case "transfer.created":
        await handleTransferCreated(event.data.object, supabase);
        break;

      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  supabase: ReturnType<typeof createAdminClient>
) {
  const datasetId = paymentIntent.metadata.dataset_id;
  const userId = paymentIntent.metadata.user_id;
  const paymentType = paymentIntent.metadata.type;

  if (!userId) {
    console.error("Missing user_id in payment intent metadata");
    return;
  }

  // Handle wallet funding
  if (paymentType === "wallet_funding") {
    console.log(`💰 Processing wallet funding for user ${userId}, amount: $${paymentIntent.amount / 100}`);
    
    // Record as a 'deposit' transaction and rely on DB trigger to update wallet
    const { data: transaction, error: transactionError } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      status: "completed",
      description: "Wallet funding payment",
      reference_id: paymentIntent.id,
      metadata: {
        type: "wallet_funding",
        stripe_payment_intent: paymentIntent.id,
      },
    }).select().single();

    if (transactionError) {
      console.error(`❌ Error creating deposit transaction:`, transactionError);
    } else {
      console.log(`✅ Deposit transaction created:`, transaction);
      
      // Check if wallet was updated by trigger
      const { data: updatedWallet, error: walletError } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (walletError) {
        console.error(`❌ Error checking wallet after deposit:`, walletError);
      } else {
        console.log(`✅ Wallet after deposit:`, updatedWallet);
      }
    }

    console.log(`✅ Wallet funding succeeded for user ${userId}`);
    return;
  }

  // Handle dataset funding
  if (!datasetId) {
    console.error("Missing dataset_id in payment intent metadata");
    return;
  }

  // Update dataset payment status
  await supabase
    .from("dataset_requests")
    .update({
      payment_status: "paid",
      paid_amount: paymentIntent.amount / 100,
    })
    .eq("id", datasetId);

  // Create transaction record
  await supabase.from("transactions").insert({
    user_id: userId,
    type: "payment",
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency.toUpperCase(),
    status: "completed",
    description: "Dataset funding payment",
    reference_id: paymentIntent.id,
    metadata: {
      dataset_id: datasetId,
      stripe_payment_intent: paymentIntent.id,
      payment_method: "card",
    },
  });

  console.log(`Payment succeeded for dataset ${datasetId}`);
}

async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const datasetId = paymentIntent.metadata.dataset_id;
  const userId = paymentIntent.metadata.user_id;

  if (!datasetId || !userId) {
    console.error("Missing metadata in payment intent");
    return;
  }

  // Update dataset payment status
  await supabase
    .from("dataset_requests")
    .update({
      payment_status: "unpaid",
    })
    .eq("id", datasetId);

  // Create failed transaction record
  await supabase.from("transactions").insert({
    user_id: userId,
    type: "payment",
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency.toUpperCase(),
    status: "failed",
    description: "Dataset funding payment (failed)",
    reference_id: paymentIntent.id,
    metadata: {
      dataset_id: datasetId,
      stripe_payment_intent: paymentIntent.id,
      failure_reason: paymentIntent.last_payment_error?.message,
    },
  });

  console.log(`Payment failed for dataset ${datasetId}`);
}

async function handleAccountUpdated(
  account: Stripe.Account,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  // Update Stripe account status
  await supabase
    .from("stripe_accounts")
    .update({
      status: account.details_submitted ? "active" : "pending",
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    })
    .eq("stripe_account_id", account.id);

  console.log(`Account updated: ${account.id}`);
}

async function handleTransferCreated(
  transfer: Stripe.Transfer,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  console.log(`✅ Transfer created webhook received: ${transfer.id}`);

  // Find the user by Stripe account ID
  const { data: stripeAccount } = await supabase
    .from("stripe_accounts")
    .select("user_id")
    .eq("stripe_account_id", transfer.destination)
    .single();

  if (!stripeAccount) {
    console.error(
      "No user found for transfer destination:",
      transfer.destination
    );
    return;
  }

  // Check if transaction already exists to avoid duplicates
  const { data: existingTx } = await supabase
    .from("transactions")
    .select("id")
    .eq("reference_id", transfer.id)
    .single();

  if (existingTx) {
    console.log(`Transaction already exists for transfer ${transfer.id}`);
    return;
  }

  // Extract metadata from transfer
  const submissionId = transfer.metadata?.submission_id;
  const datasetId = transfer.metadata?.dataset_id;

  // Create transaction record for the payout
  await supabase.from("transactions").insert({
    user_id: stripeAccount.user_id,
    type: "payout",
    amount: transfer.amount / 100,
    currency: transfer.currency.toUpperCase(),
    status: "completed",
    description: "Contribution payout",
    reference_id: transfer.id,
    metadata: {
      stripe_transfer: transfer.id,
      destination: transfer.destination,
      submission_id: submissionId,
      dataset_id: datasetId,
    },
  });

  console.log(
    `✅ Transfer created successfully for user ${
      stripeAccount.user_id
    }, amount: $${transfer.amount / 100}`
  );
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  // Handle any additional logic for completed checkout sessions
  console.log(`Checkout session completed: ${session.id}`);
}
