"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripeServer } from "@/lib/stripe/server";
import { revalidatePath } from "next/cache";

// Create payment intent for dataset request funding or wallet funding
export async function createPaymentIntent(
  datasetId: string,
  amount: number,
  currency: string = "USD"
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Handle wallet funding (special case)
  if (datasetId === "wallet-funding") {
    try {
      const stripe = getStripeServer();
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        metadata: {
          user_id: user.id,
          type: "wallet_funding",
        },
        description: `Wallet funding for user`,
      });

      return { 
        data: { 
          client_secret: paymentIntent.client_secret,
          payment_intent_id: paymentIntent.id 
        } 
      };
    } catch (error) {
      console.error("Error creating wallet funding payment intent:", error);
      return { error: "Failed to create payment intent" };
    }
  }

  // Verify user owns the dataset request
  const { data: dataset, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("id, created_by, title, total_budget")
    .eq("id", datasetId)
    .eq("created_by", user.id)
    .single();

  if (datasetError || !dataset) {
    return { error: "Dataset not found or access denied" };
  }

  try {
    // Create payment intent
    const stripe = getStripeServer();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        dataset_id: datasetId,
        user_id: user.id,
        type: "dataset_funding",
      },
      description: `Funding for dataset: ${dataset.title}`,
    });

    // Update dataset with payment intent ID
    await supabase
      .from("dataset_requests")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        total_budget: amount,
      })
      .eq("id", datasetId);

    return { 
      data: { 
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id 
      } 
    };
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return { error: "Failed to create payment intent" };
  }
}

// Confirm payment and update dataset status
export async function confirmPayment(paymentIntentId: string) {
  const supabase = await createClient();

  try {
    // Retrieve payment intent from Stripe
    const stripe = getStripeServer();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return { error: "Payment not successful" };
    }

    const datasetId = paymentIntent.metadata.dataset_id;
    const userId = paymentIntent.metadata.user_id;

    // Update dataset payment status
    const { error: updateError } = await supabase
      .from("dataset_requests")
      .update({
        payment_status: "paid",
        paid_amount: paymentIntent.amount / 100, // Convert from cents
      })
      .eq("id", datasetId);

    if (updateError) {
      console.error("Error updating dataset:", updateError);
      return { error: "Failed to update dataset" };
    }

    // Create transaction record
    const { error: transactionError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "payment",
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        status: "completed",
        description: `Payment for dataset funding`,
        reference_id: paymentIntentId,
        metadata: {
          dataset_id: datasetId,
          stripe_payment_intent: paymentIntentId,
        },
      });

    if (transactionError) {
      console.error("Error creating transaction:", transactionError);
    }

    revalidatePath("/dashboard/requests");
    revalidatePath("/dashboard/billing");

    return { data: { success: true } };
  } catch (error) {
    console.error("Error confirming payment:", error);
    return { error: "Failed to confirm payment" };
  }
}

// Get user's wallet balance
export async function getUserWallet() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: wallet, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Error fetching wallet:", error);
    return { error: "Failed to fetch wallet" };
  }

  return { data: wallet };
}

// Get user's transaction history
export async function getUserTransactions(limit: number = 50) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching transactions:", error);
    return { error: "Failed to fetch transactions" };
  }

  return { data: transactions };
}

// Create Stripe Connect account for contributor
export async function createStripeConnectAccount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check if user already has a Stripe account
  const { data: existingAccount } = await supabase
    .from("stripe_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (existingAccount) {
    return { 
      data: { 
        account_id: existingAccount.stripe_account_id,
        onboarding_url: null // Already onboarded
      } 
    };
  }

  try {
    // Get user profile for account creation
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, mail")
      .eq("id", user.id)
      .single();

    // Create Stripe Connect Express account
    const stripe = getStripeServer();
    const account = await stripe.accounts.create({
      type: "express",
      country: "US", // You might want to make this configurable
      email: profile?.mail || user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        user_id: user.id,
        platform: "collective-dataset",
      },
    });

    // Save account to database
    const { error: saveError } = await supabase
      .from("stripe_accounts")
      .insert({
        user_id: user.id,
        stripe_account_id: account.id,
        account_type: "express",
        status: "pending",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });

    if (saveError) {
      console.error("Error saving Stripe account:", saveError);
      return { error: "Failed to save account" };
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/wallet?refresh=true`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/wallet?success=true`,
      type: "account_onboarding",
    });

    return { 
      data: { 
        account_id: account.id,
        onboarding_url: accountLink.url 
      } 
    };
  } catch (error) {
    console.error("Error creating Stripe account:", error);
    return { error: "Failed to create Stripe account" };
  }
}

// Get Stripe Connect account status
export async function getStripeConnectAccount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: account, error } = await supabase
    .from("stripe_accounts")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    return { data: null }; // No account created yet
  }

  return { data: account };
}
